import { failureOf } from "#cli/cli-test-support";
import { SymlinkedEntryError } from "./file-presence";
import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readdir, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { ConfirmationRepRecord } from "./confirmation-record";
import {
	confirmationRepRecordSchema,
	parseConfirmationGroupRecord,
} from "./confirmation-record";
import {
	captureStageCorpus,
	hashWorkflowState,
	initialCheckpointInputs,
	materializeCheckpoint,
	recordCheckpoint,
} from "./checkpoint";
import { captureBaselineContext, captureFileHashes } from "./checks";
import { runCommand } from "./command";
import { parseReplayArgs } from "./config";
import type { ClaudeCallMetrics } from "./contracts";
import type { JudgeAttempt } from "./judge-attempt";
import {
	JudgeExecutionError,
	JudgeOutputValidationError,
} from "./judge-attempt";
import type { RunManifest } from "./manifest";
import { writeRunManifest } from "./manifest";
import { runReplayConfirmation } from "./replay-confirmation";
import { benchmarkRunPaths } from "./run-layout";
import { readShortIds } from "./short-id";
import type { loadStageRubric } from "./stage-grading";
import { addWorktree, currentSha, removeWorktree } from "./target";
import {
	TEST_TARGET,
	TestResources,
	commitAll,
	harnessResult,
} from "./test-support";
import {
	ReplayConfirmationHarness,
	replayScorecard,
} from "./replay-confirmation-test-support";

const testResources = TestResources.forEachTest();

function parseConfirmationRepRecord(text: string): ConfirmationRepRecord {
	return confirmationRepRecordSchema.parse(JSON.parse(text));
}

describe(runReplayConfirmation.name, () => {
	it("refuses a foreign layout before creating a replay repetition", async () => {
		const harness = new ReplayConfirmationHarness(testResources);
		const run = await harness.recordedRun();
		const root = join(run.paths.runsDirectory, "corpus");
		await Bun.write(join(root, "skills", "discuss", "SKILL.md"), "discuss\n");
		const outside = join(run.paths.runsDirectory, "foreign");
		await Bun.write(join(outside, "private.md"), "foreign bytes\n");
		await symlink(outside, join(root, "agents"));

		const failure = await failureOf(
			harness.runConfirmation(
				{ paths: run.paths, corpusRoots: [{ kind: "directory", root }] },
				{},
			),
		);

		expect(failure).toBeInstanceOf(SymlinkedEntryError);
		expect(harness.worktrees).toEqual([]);
		expect(harness.stageDirs).toEqual([]);
		expect(await readShortIds(run.paths.runsDirectory, "audit-log")).toEqual(
			[],
		);
	});

	it("claims the group a short id in its source run's case", async () => {
		const harness = new ReplayConfirmationHarness(testResources);
		const run = await harness.recordedRun();
		const corpusRoot = await mkdtemp(join(tmpdir(), "rehearse-corpus-"));
		testResources.track(corpusRoot);
		for (const skill of ["discuss", "build", "doctrine"]) {
			await Bun.write(
				join(corpusRoot, "skills", skill, "SKILL.md"),
				`${skill}\n`,
			);
		}

		const outcome = await harness.runConfirmation(
			{
				paths: run.paths,
				corpusRoots: [{ kind: "directory", root: corpusRoot }],
			},
			{ reps: 2 },
		);
		const group = parseConfirmationGroupRecord(
			await Bun.file(outcome.groupRecordFile).text(),
		);

		expect(await readShortIds(run.paths.runsDirectory, "audit-log")).toEqual([
			{
				shortId: "audit-log/g1",
				record: {
					kind: "group",
					groupId: group.groupId,
					source: { run: run.paths.name, stage: "discuss" },
				},
			},
		]);
	});

	it("measures the corpus once for the group and records that version on the group", async () => {
		const harness = new ReplayConfirmationHarness(testResources);
		const run = await harness.recordedRun();
		const corpusRoot = await mkdtemp(join(tmpdir(), "rehearse-corpus-"));
		testResources.track(corpusRoot);
		await Bun.write(join(corpusRoot, "skills", "discuss", "SKILL.md"), "d\n");
		let measurements = 0;

		const outcome = await harness.runConfirmation(
			{
				paths: run.paths,
				corpusRoots: [{ kind: "directory", root: corpusRoot }],
			},
			{ reps: 2 },
			(dependencies) => ({
				...dependencies,
				stageSession: {
					...dependencies.stageSession,
					measureCorpus: () => {
						measurements += 1;

						return Promise.resolve({
							kind: "version",
							digest: String(measurements).repeat(64),
						});
					},
				},
			}),
		);
		const group = parseConfirmationGroupRecord(
			await Bun.file(outcome.groupRecordFile).text(),
		);

		expect(measurements).toBe(1);
		expect(group.inputs.corpusVersion).toEqual({
			kind: "version",
			digest: "1".repeat(64),
		});
	});

	it("reports agreement for the resolved Judge model", async () => {
		const harness = new ReplayConfirmationHarness(testResources);
		const run = await harness.recordedRun();
		const calibrationArtifact = {
			status: "COMPLETE",
			rubric: "1. `agreement`: calibrated\n",
			grade: {
				requirements: [
					{
						id: "agreement",
						status: "PASS",
						evidence: [
							{
								source: "diff",
								path: "change.diff",
								claim: "calibrated evidence",
							},
						],
					},
				],
				verdict: "PASS",
				summary: "calibrated grade",
			},
			stageScorecards: [],
			calibration: {
				humanReview: {
					verdict: "ACCEPT",
					summary: "The human agrees.",
					findings: [],
				},
			},
		};
		await Promise.all([
			Bun.write(
				join(run.paths.runsDirectory, "opus-agreement.json"),
				JSON.stringify({ ...calibrationArtifact, judgeModel: "opus" }),
			),
			Bun.write(
				join(run.paths.runsDirectory, "sonnet-agreement.json"),
				JSON.stringify({ ...calibrationArtifact, judgeModel: "sonnet" }),
			),
		]);
		const corpusRoot = await mkdtemp(join(tmpdir(), "rehearse-corpus-"));
		testResources.track(corpusRoot);
		for (const skill of ["discuss", "doctrine"]) {
			await mkdir(join(corpusRoot, "skills", skill), { recursive: true });
			await Bun.write(
				join(corpusRoot, "skills", skill, "SKILL.md"),
				`${skill}\n`,
			);
		}
		const config = parseReplayArgs(
			[
				"--run",
				run.paths.name,
				"--stage",
				"discuss",
				"--model",
				"sonnet",
				"--session-budget-usd",
				"5",
			],
			{},
		);

		const outcome = await harness.runConfirmation(
			{
				paths: run.paths,
				corpusRoots: [{ kind: "directory", root: corpusRoot }],
			},
			{ model: config.model, judgeModel: config.judgeModel },
		);
		const group = parseConfirmationGroupRecord(
			await Bun.file(outcome.groupRecordFile).text(),
		);
		const report = z
			.object({
				judgeAgreement: z.object({
					baselines: z.array(
						z.object({
							judgeModel: z.string(),
							criteria: z.array(
								z.object({ rubricId: z.string(), sampleSize: z.number() }),
							),
						}),
					),
				}),
			})
			.parse(JSON.parse(await Bun.file(outcome.reportFile).text()));

		expect({
			model: group.inputs.model,
			judgeModel: group.inputs.judgeModel,
		}).toEqual({ model: "sonnet", judgeModel: "opus" });
		expect(report.judgeAgreement.baselines).toEqual([
			{
				judgeModel: "opus",
				criteria: [{ rubricId: "agreement", sampleSize: 1 }],
			},
		]);
	});

	it("uses the recorded target for delivery replay confirmations", async () => {
		const fake = new ReplayConfirmationHarness(testResources);
		const run = await fake.recordedRun();
		const corpusRoot = await mkdtemp(join(tmpdir(), "rehearse-corpus-"));
		testResources.track(corpusRoot);
		for (const skill of ["discuss", "build", "doctrine"]) {
			await mkdir(join(corpusRoot, "skills", skill), { recursive: true });
			await Bun.write(
				join(corpusRoot, "skills", skill, "SKILL.md"),
				`${skill}\n`,
			);
		}

		await fake.runConfirmation(
			{
				paths: run.paths,
				corpusRoots: [{ kind: "directory", root: corpusRoot }],
			},
			{ stage: "build", reps: 2 },
		);

		expect(fake.integrityFileSets).toEqual([
			run.manifest.pipeline.target.integrityFiles,
			run.manifest.pipeline.target.integrityFiles,
		]);
		expect(fake.targetChecks).toEqual([
			run.manifest.pipeline.target.checks,
			run.manifest.pipeline.target.checks,
		]);
	});

	it("passes a declared settings overlay to every confirmed stage session", async () => {
		const fake = new ReplayConfirmationHarness(testResources);
		const run = await fake.recordedRun();
		const corpusRoot = await mkdtemp(join(tmpdir(), "rehearse-corpus-"));
		testResources.track(corpusRoot);
		await mkdir(join(corpusRoot, "skills", "discuss"), { recursive: true });
		await Bun.write(
			join(corpusRoot, "skills", "discuss", "SKILL.md"),
			"discuss\n",
		);

		await fake.runConfirmation(
			{
				paths: run.paths,
				corpusRoots: [{ kind: "directory", root: corpusRoot }],
			},
			{
				loadedSettings: {
					json: '{"disableAllHooks":true}',
					hashed: { path: "stage-settings.json", sha256: "a".repeat(64) },
				},
				reps: 2,
			},
		);

		expect(fake.settingsOverlays).toEqual([
			'{"disableAllHooks":true}',
			'{"disableAllHooks":true}',
		]);
	});

	it("runs three frozen stage replay reps concurrently without changing the primary checkout", async () => {
		const parent = await mkdtemp(join(tmpdir(), "rehearse-confirmed-replay-"));
		testResources.track(parent);
		const primary = join(parent, "primary");
		await mkdir(primary);
		await runCommand(["git", "init", "-b", "main"], primary);
		await runCommand(["git", "config", "user.name", "Benchmark Test"], primary);
		await runCommand(
			["git", "config", "user.email", "benchmark@example.com"],
			primary,
		);
		await Bun.write(
			join(primary, ".gitignore"),
			"backlog/\n.boris/\n.claude/\nnode_modules/\n",
		);
		await Bun.write(join(primary, "base.txt"), "base\n");
		await commitAll(primary, "chore: base");
		const taskSha = await currentSha(primary);
		await mkdir(join(primary, "backlog"), { recursive: true });
		await Bun.write(join(primary, "backlog", "config.yml"), "statuses: []\n");
		const paths = benchmarkRunPaths(parent, "run");
		const initial = await recordCheckpoint(
			primary,
			paths.checkpointDirectory("initial"),
			initialCheckpointInputs(
				{
					taskSha,
					task: "Task text",
					productBrief: "Brief text",
					workflowFiles: await hashWorkflowState(primary),
				},
				"sonnet",
				"high",
			),
		);
		const manifest: RunManifest = {
			caseId: "audit-log",
			timestamp: "2026-08-31T00:00:00.000Z",
			controlSha: "run-control-sha",
			sourceRoot: primary,
			sourceSha: taskSha,
			taskId: "TASK-1",
			taskSha,
			task: "Task text",
			productBrief: "Brief text",
			model: "sonnet",
			effort: "high",
			judgeModel: "opus",
			judgeEffort: "high",
			sessionBudgetUsd: 5,
			pipelinePath: "pipelines/default.json",
			pipeline: {
				statuses: ["To Do", "Done"],
				target: TEST_TARGET,
				stages: [
					{
						name: "discuss",
						kind: "planning",
						skill: "discuss",
						artifact: "spec",
						rubric: "rubrics/discuss.json",
						requiresAcceptanceCriteria: false,
					},
				],
			},
		};
		await writeRunManifest(paths.manifestFile, manifest);
		const corpusRoot = join(parent, "corpus");
		await mkdir(join(corpusRoot, "skills", "discuss"), { recursive: true });
		await mkdir(join(corpusRoot, "skills", "doctrine"), { recursive: true });
		await Bun.write(
			join(corpusRoot, "skills", "discuss", "SKILL.md"),
			"frozen discuss\n",
		);
		await Bun.write(
			join(corpusRoot, "skills", "doctrine", "SKILL.md"),
			"frozen doctrine\n",
		);
		const rubric = {
			rubricPath: "rubrics/discuss.json",
			content: '{"frozen":true}\n',
			rubric: {
				hardBlockers: [],
				requirements: [{ id: "scope", description: "Scope is explicit" }],
				dimensions: [
					{ id: "clarity", description: "Clear", good: "g", excellent: "e" },
				],
			},
		} satisfies Awaited<ReturnType<typeof loadStageRubric>>;
		const metric: ClaudeCallMetrics = {
			costUsd: 0.25,
			inputTokens: 100,
			outputTokens: 20,
			cacheReadTokens: 30,
			cacheWriteTokens: 40,
			turns: 2,
		};
		const allStarted = Promise.withResolvers<boolean>();
		const release = Promise.withResolvers<boolean>();
		const consumedInputs: {
			readonly targetDir: string;
			readonly branch: string;
			readonly skill: string;
			readonly instructions: string;
			readonly checkpoint: string;
			rubric: string;
			readonly model: string;
			readonly effort: string | undefined;
			readonly budget: number;
		}[] = [];
		const primaryBefore = {
			head: await runCommand(["git", "rev-parse", "HEAD"], primary),
			branch: await runCommand(["git", "branch", "--show-current"], primary),
			status: await runCommand(["git", "status", "--porcelain"], primary),
			base: await Bun.file(join(primary, "base.txt")).bytes(),
		};

		const fake = new ReplayConfirmationHarness(testResources);
		const execution = fake.runConfirmation(
			{ paths, corpusRoots: [{ kind: "directory", root: corpusRoot }] },
			{ effort: "high", judgeEffort: "high" },
			(defaults) => ({
				...defaults,
				stageSession: {
					...defaults.stageSession,
					runWorkflowStage: async (workflowRequest) => {
						const ordinal = consumedInputs.push({
							targetDir: workflowRequest.targetDir,
							branch: await runCommand(
								["git", "branch", "--show-current"],
								workflowRequest.targetDir,
							),
							skill: await Bun.file(
								join(
									workflowRequest.targetDir,
									".claude",
									"skills",
									"discuss",
									"SKILL.md",
								),
							).text(),
							instructions: await Bun.file(
								join(workflowRequest.targetDir, ".claude", "CLAUDE.md"),
							).text(),
							checkpoint: await Bun.file(
								join(workflowRequest.targetDir, "backlog", "config.yml"),
							).text(),
							rubric: "",
							model: workflowRequest.model,
							effort: workflowRequest.effort,
							budget: workflowRequest.sessionBudgetUsd,
						});
						if (consumedInputs.length === 3) {
							allStarted.resolve(true);
						}
						await release.promise;
						await mkdir(join(workflowRequest.targetDir, "backlog", "docs"), {
							recursive: true,
						});
						await Bun.write(
							join(
								workflowRequest.targetDir,
								"backlog",
								"docs",
								"DOC-1 - spec.md",
							),
							"confirmed spec\n",
						);

						return {
							stage: workflowRequest.stage,
							sessionId: `session-${ordinal}`,
							costUsd: metric.costUsd,
							providerCalls: [{ metrics: metric }],
							exchanges: [],
						};
					},
					readTaskOutput: () =>
						Promise.resolve(
							JSON.stringify({
								task: {
									acceptanceCriteria: ["done"],
									documentation: ["DOC-1 - spec.md"],
								},
							}),
						),
					readTaskCard: () => Promise.resolve("confirmed task card"),
					captureBuildCandidate: () =>
						Promise.reject(new Error("not a delivery stage")),
					assertPlanningStageCompleted: async (
						targetDir,
						baselineSha,
						stage,
					) => ({
						taskState: `${stage.name}-state`,
						artifact: {
							path: "backlog/docs/DOC-1 - spec.md",
							content: await Bun.file(
								join(targetDir, "backlog", "docs", "DOC-1 - spec.md"),
							).text(),
						},
						resultSha: baselineSha,
						diff: "",
						changedPaths: [],
					}),
					assertBuildCommitted: () =>
						Promise.reject(new Error("not a delivery stage")),
					changedPathsBetween: () => Promise.resolve([]),
					captureCheckIntegrity: () =>
						Promise.resolve(harnessResult("PASS", "checks match")),
					captureTreatmentChecks: () =>
						Promise.resolve(harnessResult("PASS", "all green")),
					captureStageCorpus,
				},
				runStageJudge: (_model, _effort, _budget, input, source) => {
					const target =
						consumedInputs[
							Number(input.transcript.sessionId.replace("session-", "")) - 1
						];
					if (target !== undefined) {
						target.rubric = source.content;
					}

					return Promise.resolve({
						...replayScorecard(input),
						rubricPath: source.rubricPath,
						rubric: source.rubric,
						attempts: [
							{
								payload: { summary: "accepted" },
								costUsd: metric.costUsd,
								metrics: metric,
								outcome: "ACCEPTED",
							},
						],
					});
				},
				loadStageRubric: () => Promise.resolve(rubric),
				addWorktree,
				removeWorktree,
				materializeCheckpoint,
				captureBaselineContext,
				captureFileHashes,
				currentSha,
				installDependencies: () =>
					Promise.reject(new Error("not a delivery stage")),
				log: () => undefined,
			}),
		);

		await allStarted.promise;
		expect(consumedInputs).toHaveLength(3);
		expect(new Set(consumedInputs.map(({ targetDir }) => targetDir)).size).toBe(
			3,
		);
		expect(consumedInputs.every(({ branch }) => branch === "")).toBe(true);
		release.resolve(true);
		const outcome = await execution;

		const records = await Promise.all(
			outcome.repRecordFiles.map(async (recordFile) =>
				parseConfirmationRepRecord(await Bun.file(recordFile).text()),
			),
		);
		expect(records.map(({ repId }) => repId)).toEqual([
			"confirmation-stage-1-rep-1",
			"confirmation-stage-1-rep-2",
			"confirmation-stage-1-rep-3",
		]);
		expect(new Set(outcome.repRecordFiles).size).toBe(3);
		expect(
			records.every(({ outcome: result }) => result === "SUCCESSFUL"),
		).toBe(true);
		expect(
			consumedInputs.map(({ targetDir: _targetDir, ...input }) => input),
		).toEqual(
			Array.from({ length: 3 }, () => ({
				branch: "",
				skill: "frozen discuss\n",
				instructions: "Frozen instructions\n",
				checkpoint: "statuses: []\n",
				rubric: rubric.content,
				model: "sonnet",
				effort: "high",
				budget: 5,
			})),
		);
		const group = parseConfirmationGroupRecord(
			await Bun.file(outcome.groupRecordFile).text(),
		);
		expect(group.inputs.lineage).toEqual({
			kind: "CHECKPOINT",
			lineage: initial.lineage,
			targetSha: taskSha,
		});
		expect(group.inputs.pipelinePath).toBe("pipelines/default.json");
		expect(group.inputs.sessionBudgetUsd).toBe(5);
		expect(new Set(group.inputs.files.map(({ kind }) => kind))).toEqual(
			new Set([
				"checkpoint",
				"corpus",
				"rubric",
				"pipeline",
				"instructions",
				"task",
				"product-brief",
			]),
		);
		const primaryAfter = {
			head: await runCommand(["git", "rev-parse", "HEAD"], primary),
			branch: await runCommand(["git", "branch", "--show-current"], primary),
			status: await runCommand(["git", "status", "--porcelain"], primary),
			base: await Bun.file(join(primary, "base.txt")).bytes(),
		};
		expect(primaryAfter).toEqual(primaryBefore);
		const worktrees = await runCommand(
			["git", "worktree", "list", "--porcelain"],
			primary,
		);
		expect(
			worktrees.split("\n").filter((line) => line.startsWith("worktree ")),
		).toHaveLength(1);
	});

	it("carries Product Owner provider calls into replay evidence", async () => {
		const metric: ClaudeCallMetrics = {
			costUsd: 0.25,
			inputTokens: 100,
			outputTokens: 20,
			cacheReadTokens: 30,
			cacheWriteTokens: 40,
			turns: 2,
		};
		const fake = new ReplayConfirmationHarness(testResources);
		const recorded = await fake.recordedRun();
		const corpusRoot = await mkdtemp(join(tmpdir(), "replay-po-corpus-"));
		testResources.track(corpusRoot);
		for (const skill of ["discuss", "doctrine"]) {
			await mkdir(join(corpusRoot, "skills", skill), { recursive: true });
			await Bun.write(
				join(corpusRoot, "skills", skill, "SKILL.md"),
				`${skill}\n`,
			);
		}

		const outcome = await fake.runConfirmation(
			{
				paths: recorded.paths,
				corpusRoots: [{ kind: "directory", root: corpusRoot }],
			},
			{},
			(dependencies) => ({
				...dependencies,
				currentSha: () => Promise.resolve(recorded.manifest.taskSha),
				createProductOwner: () => ({
					ask: () => Promise.resolve("Use the small scope"),
					snapshot: () => ({
						sessionId: "po-session",
						spentUsd: metric.costUsd,
						providerCalls: [{ metrics: metric }, {}],
					}),
				}),
				stageSession: {
					...dependencies.stageSession,
					runWorkflowStage: async (request) => ({
						...(await dependencies.stageSession.runWorkflowStage(request)),
						providerCalls: [{ metrics: metric }],
					}),
				},
				runStageJudge: (_model, _effort, _budget, input) =>
					Promise.resolve({
						...replayScorecard(input),
						attempts: [
							{
								payload: { summary: "accepted" },
								costUsd: metric.costUsd,
								metrics: metric,
								outcome: "ACCEPTED",
							},
						],
					}),
			}),
		);
		const [recordFile] = outcome.repRecordFiles;
		const record = parseConfirmationRepRecord(
			await Bun.file(recordFile ?? "missing").text(),
		);

		expect(record.metrics).toEqual({
			status: "MISSING",
			calls: [
				{ role: "worker", metrics: metric },
				{ role: "product-owner", metrics: metric },
				{ role: "stage-judge", metrics: metric },
			],
			missing: ["product-owner call metrics"],
		});
	});

	it("records on each rep's stage file the judge rubric it was graded by", async () => {
		const harness = new ReplayConfirmationHarness(testResources);
		const run = await harness.recordedRun();

		const corpusRoot = await mkdtemp(join(tmpdir(), "rehearse-corpus-"));
		testResources.track(corpusRoot);
		await Bun.write(join(corpusRoot, "skills", "discuss", "SKILL.md"), "d\n");

		const outcome = await harness.runConfirmation(
			{
				paths: run.paths,
				corpusRoots: [{ kind: "directory", root: corpusRoot }],
			},
			{ reps: 2 },
		);

		const rubricEntries = await Promise.all(
			outcome.repRecordFiles.map(async (recordFile) =>
				z
					.object({
						readManifest: z.array(
							z.object({ path: z.string(), half: z.string() }).loose(),
						),
					})
					.parse(
						JSON.parse(
							await Bun.file(
								join(dirname(recordFile), "stages", "discuss.json"),
							).text(),
						),
					)
					.readManifest.filter(({ half }) => half === "rubric")
					.map(({ path, half, role }) => ({ path, half, role })),
			),
		);
		expect(rubricEntries).toEqual([
			[{ path: "rubrics/discuss.json", half: "rubric", role: "judge rubric" }],
			[{ path: "rubrics/discuss.json", half: "rubric", role: "judge rubric" }],
		]);
	});

	it("retains completed stage evidence when the Judge invocation fails", async () => {
		const metric: ClaudeCallMetrics = {
			costUsd: 0.25,
			inputTokens: 100,
			outputTokens: 20,
			cacheReadTokens: 30,
			cacheWriteTokens: 40,
			turns: 2,
		};
		const fake = new ReplayConfirmationHarness(testResources);
		const recorded = await fake.recordedRun();
		const corpusRoot = await mkdtemp(join(tmpdir(), "replay-judge-corpus-"));
		testResources.track(corpusRoot);
		for (const skill of ["discuss", "doctrine"]) {
			await mkdir(join(corpusRoot, "skills", skill), { recursive: true });
			await Bun.write(
				join(corpusRoot, "skills", skill, "SKILL.md"),
				`${skill}\n`,
			);
		}

		const outcome = await fake.runConfirmation(
			{
				paths: recorded.paths,
				corpusRoots: [{ kind: "directory", root: corpusRoot }],
			},
			{ groupId: "judge-execution-evidence", reps: 2 },
			(dependencies) => ({
				...dependencies,
				currentSha: () => Promise.resolve(recorded.manifest.taskSha),
				createProductOwner: () => ({
					ask: () => Promise.resolve("Use the small scope"),
					snapshot: () => ({
						sessionId: "po-session",
						spentUsd: metric.costUsd,
						providerCalls: [{ metrics: metric }],
					}),
				}),
				stageSession: {
					...dependencies.stageSession,
					runWorkflowStage: async (request) => ({
						...(await dependencies.stageSession.runWorkflowStage(request)),
						providerCalls: [{ metrics: metric }],
					}),
				},
				runStageJudge: () =>
					Promise.reject(
						new JudgeExecutionError({
							cause: new Error("stage Judge invocation failed"),
							prompt: "prompt",
							attempts: [],
							costUsd: 0,
						}),
					),
			}),
		);
		const [recordFile] = outcome.repRecordFiles;
		const record = parseConfirmationRepRecord(
			await Bun.file(recordFile ?? "missing").text(),
		);
		testResources.track(dirname(record.worktreePath));

		expect(record.metrics).toEqual({
			status: "MISSING",
			calls: [
				{ role: "worker", metrics: metric },
				{ role: "product-owner", metrics: metric },
			],
			missing: ["stage-judge call metrics"],
		});
		expect(record.workerTrajectorySteps).toBe(metric.turns);
	});

	it("removes the temporary root after every replay rep completes with durable evidence", async () => {
		const source = await testResources.createRepository();
		const taskSha = await currentSha(source.directory);
		await mkdir(join(source.directory, "backlog"), { recursive: true });
		await Bun.write(
			join(source.directory, "backlog", "config.yml"),
			"statuses: []\n",
		);
		const parent = await mkdtemp(join(tmpdir(), "rehearse-replay-cleanup-"));
		testResources.track(parent);
		const paths = benchmarkRunPaths(parent, "run");
		await recordCheckpoint(
			source.directory,
			paths.checkpointDirectory("initial"),
			initialCheckpointInputs(
				{
					taskSha,
					task: "Task text",
					productBrief: "Brief text",
					workflowFiles: await hashWorkflowState(source.directory),
				},
				"sonnet",
			),
		);
		await writeRunManifest(paths.manifestFile, {
			caseId: "audit-log",
			timestamp: "2026-08-31T00:00:00.000Z",
			controlSha: "run-control-sha",
			sourceRoot: source.directory,
			sourceSha: taskSha,
			taskId: "TASK-1",
			taskSha,
			task: "Task text",
			productBrief: "Brief text",
			model: "sonnet",
			judgeModel: "opus",
			sessionBudgetUsd: 5,
			pipelinePath: "pipelines/default.json",
			pipeline: {
				statuses: ["To Do", "Done"],
				target: TEST_TARGET,
				stages: [
					{
						name: "discuss",
						kind: "planning",
						skill: "discuss",
						artifact: "spec",
						rubric: "rubrics/discuss.json",
						requiresAcceptanceCriteria: false,
					},
				],
			},
		});
		const corpusRoot = join(parent, "corpus");
		await mkdir(join(corpusRoot, "skills", "discuss"), { recursive: true });
		await mkdir(join(corpusRoot, "skills", "doctrine"), { recursive: true });
		await Bun.write(
			join(corpusRoot, "skills", "discuss", "SKILL.md"),
			"frozen discuss\n",
		);
		await Bun.write(
			join(corpusRoot, "skills", "doctrine", "SKILL.md"),
			"frozen doctrine\n",
		);
		const metric: ClaudeCallMetrics = {
			costUsd: 0.25,
			inputTokens: 100,
			outputTokens: 20,
			cacheReadTokens: 30,
			cacheWriteTokens: 40,
			turns: 2,
		};
		const removed: string[] = [];
		const fake = new ReplayConfirmationHarness(testResources);

		const outcome = await fake.runConfirmation(
			{ paths, corpusRoots: [{ kind: "directory", root: corpusRoot }] },
			{ groupId: "confirmation-cleanup", reps: 2 },
			(defaults) => ({
				...defaults,
				stageSession: {
					...defaults.stageSession,
					runWorkflowStage: (workflowRequest) =>
						Promise.resolve({
							stage: workflowRequest.stage,
							sessionId: workflowRequest.targetDir,
							costUsd: metric.costUsd,
							providerCalls: [{ metrics: metric }],
							exchanges: [],
						}),
					assertPlanningStageCompleted: (_targetDir, baselineSha, stage) =>
						Promise.resolve({
							taskState: `${stage.name}-state`,
							artifact: {
								path: "backlog/docs/DOC-1 - spec.md",
								content: "confirmed spec\n",
							},
							resultSha: baselineSha,
							diff: "",
							changedPaths: [],
						}),
					captureStageCorpus,
				},
				runStageJudge: (_model, _effort, _budget, input) => {
					const attempt: JudgeAttempt = {
						payload: { summary: "completed" },
						costUsd: metric.costUsd,
						metrics: metric,
						outcome: "ACCEPTED",
					};
					if (input.transcript.sessionId.endsWith("-rep-2")) {
						throw new JudgeOutputValidationError({
							message: "Judge rejected both attempts",
							prompt: "prompt",
							attempts: [
								{ ...attempt, outcome: "REJECTED", error: "invalid output" },
							],
							costUsd: metric.costUsd,
						});
					}

					return Promise.resolve({
						...replayScorecard(input, "STOP"),
						attempts: [attempt],
					});
				},
				loadStageRubric: () =>
					Promise.resolve({
						rubricPath: "rubrics/discuss.json",
						content: "{}\n",
						rubric: {
							hardBlockers: [],
							requirements: [],
							dimensions: [],
						},
					}),
				addWorktree,
				removeWorktree: async (targetDir, worktreeDir) => {
					removed.push(worktreeDir);
					await removeWorktree(targetDir, worktreeDir);
				},
				materializeCheckpoint,
				captureBaselineContext,
				captureFileHashes,
				currentSha,
			}),
		);
		const records = await Promise.all(
			outcome.repRecordFiles.map(async (path) =>
				parseConfirmationRepRecord(await Bun.file(path).text()),
			),
		);
		const temporaryRoot = dirname(records[0]?.worktreePath ?? "missing");

		expect(records.map(({ stages }) => stages[0]?.status)).toEqual([
			"JUDGED",
			"EXECUTION_FAILED",
		]);
		expect(
			removed.toSorted((left, right) => left.localeCompare(right)),
		).toEqual(
			records
				.map(({ worktreePath }) => worktreePath)
				.toSorted((left, right) => left.localeCompare(right)),
		);
		expect(
			await Promise.all(
				records.map((record) => {
					const [stage] = record.stages;
					if (
						stage?.status === "NOT_REACHED" ||
						stage?.evidence === undefined
					) {
						throw new Error("Expected durable stage evidence");
					}

					return runCommand(
						[
							"git",
							"rev-parse",
							`refs/rehearse/confirmation-cleanup/${record.repId}`,
						],
						source.directory,
					);
				}),
			),
		).toEqual(
			records.map((record) => {
				const [stage] = record.stages;
				if (stage?.status === "NOT_REACHED" || stage?.evidence === undefined) {
					throw new Error("Expected durable stage evidence");
				}

				return `${stage.evidence.resultSha}\n`;
			}),
		);
		const evidenceReferences = records.map(
			({ stages }) =>
				z
					.object({ evidence: z.object({ recordFile: z.string() }) })
					.parse(stages[0]).evidence,
		);
		const judgeEvidence = await Promise.all(
			evidenceReferences.map(async ({ recordFile }, index) =>
				z
					.unknown()
					.parse(
						JSON.parse(
							await Bun.file(
								join(
									dirname(outcome.repRecordFiles[index] ?? "missing"),
									recordFile,
								),
							).text(),
						),
					),
			),
		);

		expect(judgeEvidence).toMatchObject([
			{ grade: { verdict: "STOP" } },
			{ status: "REJECTED", attempts: [{ outcome: "REJECTED" }] },
		]);
		expect(
			await stat(temporaryRoot).then(
				() => true,
				() => false,
			),
		).toBe(false);
	});

	it("cleans completed Judge outcomes while preserving a pre-evidence failure", async () => {
		const source = await testResources.createRepository();
		const taskSha = await currentSha(source.directory);
		await mkdir(join(source.directory, "backlog"), { recursive: true });
		await Bun.write(
			join(source.directory, "backlog", "config.yml"),
			"statuses: []\n",
		);
		const parent = await mkdtemp(join(tmpdir(), "rehearse-replay-failures-"));
		testResources.track(parent);
		const paths = benchmarkRunPaths(parent, "run");
		await recordCheckpoint(
			source.directory,
			paths.checkpointDirectory("initial"),
			initialCheckpointInputs(
				{
					taskSha,
					task: "Task text",
					productBrief: "Brief text",
					workflowFiles: await hashWorkflowState(source.directory),
				},
				"sonnet",
			),
		);
		await writeRunManifest(paths.manifestFile, {
			caseId: "audit-log",
			timestamp: "2026-08-31T00:00:00.000Z",
			controlSha: "run-control-sha",
			sourceRoot: source.directory,
			sourceSha: taskSha,
			taskId: "TASK-1",
			taskSha,
			task: "Task text",
			productBrief: "Brief text",
			model: "sonnet",
			judgeModel: "opus",
			sessionBudgetUsd: 5,
			pipelinePath: "pipelines/default.json",
			pipeline: {
				statuses: ["To Do", "Done"],
				target: TEST_TARGET,
				stages: [
					{
						name: "discuss",
						kind: "planning",
						skill: "discuss",
						artifact: "spec",
						rubric: "rubrics/discuss.json",
						requiresAcceptanceCriteria: false,
					},
				],
			},
		});
		const corpusRoot = join(parent, "corpus");
		await mkdir(join(corpusRoot, "skills", "discuss"), { recursive: true });
		await mkdir(join(corpusRoot, "skills", "doctrine"), { recursive: true });
		await Bun.write(
			join(corpusRoot, "skills", "discuss", "SKILL.md"),
			"frozen discuss\n",
		);
		await Bun.write(
			join(corpusRoot, "skills", "doctrine", "SKILL.md"),
			"frozen doctrine\n",
		);
		const metric: ClaudeCallMetrics = {
			costUsd: 0.25,
			inputTokens: 100,
			outputTokens: 20,
			cacheReadTokens: 30,
			cacheWriteTokens: 40,
			turns: 2,
		};
		const finished: number[] = [];
		const removed: string[] = [];
		const worktreeCreated: string[] = [];
		const fake = new ReplayConfirmationHarness(testResources);
		const execution = fake.runConfirmation(
			{ paths, corpusRoots: [{ kind: "directory", root: corpusRoot }] },
			{ groupId: "confirmation-failures", reps: 4 },
			(defaults) => ({
				...defaults,
				stageSession: {
					...defaults.stageSession,
					runWorkflowStage: (workflowRequest) => {
						const match = /-rep-(?<ordinal>\d+)$/u.exec(
							workflowRequest.targetDir,
						);
						const ordinal = Number(match?.groups?.["ordinal"]);
						finished.push(ordinal);
						if (ordinal === 3) {
							return Promise.reject(new Error("worker failed before evidence"));
						}

						return Promise.resolve({
							stage: workflowRequest.stage,
							sessionId: workflowRequest.targetDir,
							costUsd: metric.costUsd,
							providerCalls: [{ metrics: metric }],
							exchanges: [],
						});
					},
					assertPlanningStageCompleted: (_targetDir, baselineSha, stage) =>
						Promise.resolve({
							taskState: `${stage.name}-state`,
							artifact: {
								path: "backlog/docs/DOC-1 - spec.md",
								content: "confirmed spec\n",
							},
							resultSha: baselineSha,
							diff: "",
							changedPaths: [],
						}),
					captureStageCorpus,
				},
				runStageJudge: (_model, _effort, _budget, input) => {
					if (input.transcript.sessionId.endsWith("-rep-4")) {
						throw new JudgeOutputValidationError({
							message: "Judge rejected both attempts",
							prompt: "prompt",
							attempts: [
								{
									payload: { invalid: true },
									costUsd: metric.costUsd,
									metrics: metric,
									outcome: "REJECTED",
									error: "invalid output",
								},
							],
							costUsd: metric.costUsd,
						});
					}

					return Promise.resolve({
						...replayScorecard(input, "STOP"),
						attempts: [
							{
								payload: { summary: "stop" },
								costUsd: metric.costUsd,
								metrics: metric,
								outcome: "ACCEPTED",
							},
						],
					});
				},
				loadStageRubric: () =>
					Promise.resolve({
						rubricPath: "rubrics/discuss.json",
						content: "{}\n",
						rubric: {
							hardBlockers: [],
							requirements: [],
							dimensions: [],
						},
					}),
				addWorktree: async (targetDir, sha, worktreeDir) => {
					if (worktreeDir.endsWith("-rep-1")) {
						throw new Error("synthetic worktree collision");
					}

					await addWorktree(targetDir, sha, worktreeDir);
					worktreeCreated.push(worktreeDir);
				},
				removeWorktree: async (targetDir, worktreeDir) => {
					removed.push(worktreeDir);
					await removeWorktree(targetDir, worktreeDir);
				},
				materializeCheckpoint: (checkpointDir, worktreeDir) => {
					if (worktreeDir.endsWith("-rep-2")) {
						throw new Error("synthetic checkpoint rejection");
					}

					return materializeCheckpoint(checkpointDir, worktreeDir);
				},
				captureBaselineContext,
				captureFileHashes,
				currentSha,
			}),
		);

		const outcome = await execution;
		const records = await Promise.all(
			outcome.repRecordFiles.map(async (path) =>
				parseConfirmationRepRecord(await Bun.file(path).text()),
			),
		);
		expect(finished.toSorted((left, right) => left - right)).toEqual([3, 4]);
		expect(records.map(({ stages }) => stages[0]?.status)).toEqual([
			"EXECUTION_FAILED",
			"EXECUTION_FAILED",
			"EXECUTION_FAILED",
			"EXECUTION_FAILED",
		]);
		expect(records[0]?.stages[0]).toMatchObject({
			error: "worktree creation failed: synthetic worktree collision",
		});
		expect(records[1]?.stages[0]).toMatchObject({
			error:
				"checkpoint materialization failed: synthetic checkpoint rejection",
		});
		expect(records[2]?.stages[0]).toMatchObject({
			error: "worker failed before evidence",
		});
		expect(worktreeCreated).toHaveLength(3);
		expect(
			removed.toSorted((left, right) => left.localeCompare(right)),
		).toEqual(
			records
				.filter(({ ordinal }) => ordinal === 4)
				.map(({ worktreePath }) => worktreePath)
				.toSorted((left, right) => left.localeCompare(right)),
		);
		const preservedPath = records[1]?.worktreePath ?? "missing";
		testResources.track(dirname(preservedPath));
		expect(fake.log).toContain(
			`Replay rep confirmation-failures-rep-2 failed; evidence preserved at ${preservedPath}`,
		);
		expect(fake.log).toContain(
			`Replay rep confirmation-failures-rep-3 failed; evidence preserved at ${records[2]?.worktreePath}`,
		);
		const preserved = await stat(preservedPath);
		expect(preserved.isDirectory()).toBe(true);
		const worktrees = await runCommand(
			["git", "worktree", "list", "--porcelain"],
			source.directory,
		);
		expect(
			worktrees.split("\n").filter((line) => line.startsWith("worktree ")),
		).toHaveLength(3);
		await removeWorktree(source.directory, preservedPath);
		await removeWorktree(
			source.directory,
			records[2]?.worktreePath ?? "missing",
		);
	});

	it("removes its worktrees directory when the confirmation body throws", async () => {
		const harness = new ReplayConfirmationHarness(testResources);
		const run = await harness.recordedRun();
		const corpusRoot = await mkdtemp(join(tmpdir(), "rehearse-corpus-"));
		testResources.track(corpusRoot);
		await mkdir(join(corpusRoot, "skills", "discuss"), { recursive: true });
		await Bun.write(
			join(corpusRoot, "skills", "discuss", "SKILL.md"),
			"discuss corpus\n",
		);
		const groupId = "confirmation-clock-failure";
		const execution = harness.runConfirmation(
			{
				paths: run.paths,
				corpusRoots: [{ kind: "directory", root: corpusRoot }],
			},
			{
				groupId,
				now: () => {
					throw new Error("clock unavailable");
				},
			},
		);

		expect(execution).rejects.toThrow("clock unavailable");
		const entries = await readdir(tmpdir());
		const leftover = entries.filter((entry) =>
			entry.startsWith(`rehearse-${groupId}-`),
		);
		expect(leftover).toEqual([]);
	});
});
