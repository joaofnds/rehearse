import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadAttempts, presentAttempts } from "./attempts";
import { assertPlanningStageCompleted } from "./backlog";
import type { CheckpointRecord, HashedFile } from "./checkpoint";
import {
	captureStageCorpus,
	installStageCorpusSnapshot,
	hashWorkflowState,
	initialCheckpointInputs,
	lineageKey,
	materializeCheckpoint,
	recordCheckpoint,
	corpusLayoutRoots,
} from "./checkpoint";
import { captureBaselineContext, captureFileHashes } from "./checks";
import { runCommand } from "./command";
import { parseReplayArgs } from "./config";
import type { StageJudgeInput } from "./contracts";
import type { CorpusMeasurement } from "./corpus-measurement";
import type { JudgeAttempt } from "./judge-attempt";
import type { RunManifest } from "./manifest";
import { writeRunManifest } from "./manifest";
import type { ReplayDependencies, ReplayRequest } from "./replay";
import {
	loadRunCheckpoints,
	readReplayRecord,
	resolveReplay,
	runReplay,
} from "./replay";
import { benchmarkRunPaths, runNameFromTimestamp } from "./run-layout";
import { readShortIds } from "./short-id";
import { failureOf } from "#cli/cli-test-support";
import { loadStageRubric } from "./stage-grading";
import { stageRubricSha256 } from "./judge-agreement";
import { projectSlug } from "./session-capture";
import { addWorktree, currentSha, removeWorktree } from "./target";
import {
	TEST_TARGET,
	TestResources,
	commitAll,
	harnessResult,
	AUDIT_LOG_RUBRICS_PATH,
} from "./test-support";
import {
	ReplayConfirmationHarness,
	replayScorecard,
} from "./replay-confirmation-test-support";
import { createProductOwner } from "./workflow";

const testResources = TestResources.forEachTest();

describe(loadRunCheckpoints.name, () => {
	it("loads every recorded checkpoint by its stage name", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-run-"));
		testResources.track(directory);
		const targetDir = join(directory, "target");
		await mkdir(join(targetDir, "backlog"), { recursive: true });
		await Bun.write(join(targetDir, "backlog", "config.yml"), "statuses: []\n");
		const runDirectory = join(directory, "checkpoints");
		const base = {
			targetSha: "task-sha",
			upstream: "root-key",
			model: "sonnet",
			corpusFiles: [],
			artifacts: [],
		};
		await recordCheckpoint(targetDir, join(runDirectory, "initial"), {
			...base,
			stage: "initial",
		});
		await recordCheckpoint(targetDir, join(runDirectory, "discuss"), {
			...base,
			stage: "discuss",
		});
		await Bun.write(join(runDirectory, "manifest.json"), "{}\n");

		const checkpoints = await loadRunCheckpoints(runDirectory);

		expect([...checkpoints.keys()].toSorted()).toEqual(["discuss", "initial"]);
		expect(checkpoints.get("discuss")?.stage).toBe("discuss");
	});
});

describe(resolveReplay.name, () => {
	function manifest(): RunManifest {
		return {
			caseId: "audit-log",
			timestamp: "2026-08-30T00:00:00.000Z",
			controlSha: "control-sha",
			sourceRoot: "/tmp/target",
			sourceSha: "source-sha",
			taskId: "TASK-1",
			taskSha: "task-sha",
			task: "Task text",
			productBrief: "Brief text",
			model: "sonnet",
			judgeModel: "sonnet",
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
					{
						name: "plan",
						kind: "planning",
						skill: "plan",
						artifact: "plan",
						rubric: "rubrics/plan.json",
						requiresAcceptanceCriteria: true,
					},
					{
						name: "build",
						kind: "delivery",
						skill: "build",
						rubric: "rubrics/build.json",
					},
				],
			},
		};
	}

	function record(
		stage: string,
		lineage: string,
		upstream: string,
		artifacts: readonly {
			readonly path: string;
			readonly sha256: string;
		}[] = [],
	): CheckpointRecord {
		return {
			stage,
			targetSha: "task-sha",
			lineage,
			upstream,
			model: "sonnet",
			corpusFiles: [],
			artifacts,
			workflowState: [],
		};
	}

	const artifactHash = { path: "backlog/docs/DOC-1 - spec.md", sha256: "aa" };

	function checkpoints(): Map<string, CheckpointRecord> {
		return new Map([
			["initial", record("initial", "lin-0", "root-key")],
			["discuss", record("discuss", "lin-1", "lin-0", [artifactHash])],
			[
				"plan",
				record("plan", "lin-2", "lin-1", [
					{ path: "backlog/docs/DOC-2 - plan.md", sha256: "bb" },
				]),
			],
		]);
	}

	it("consumes the preceding stage's checkpoint and carries earlier artifacts", () => {
		const plan = resolveReplay(manifest(), checkpoints(), "build");

		expect(plan.definition.name).toBe("build");
		expect(plan.consumed.stage).toBe("plan");
		expect(plan.consumed.lineage).toBe("lin-2");
		expect(plan.priorArtifacts.map(({ path }) => path)).toEqual([
			"backlog/docs/DOC-1 - spec.md",
			"backlog/docs/DOC-2 - plan.md",
		]);
	});

	it("replays the first stage from the initial checkpoint", () => {
		const plan = resolveReplay(manifest(), checkpoints(), "discuss");

		expect(plan.consumed.stage).toBe("initial");
		expect(plan.priorArtifacts).toEqual([]);
	});

	it("names the missing initial checkpoint on a run that predates it", () => {
		const stale = checkpoints();
		stale.delete("initial");

		expect(() => resolveReplay(manifest(), stale, "discuss")).toThrow(
			/no initial checkpoint/u,
		);
	});

	it("refuses a stage the run's pipeline never declared", () => {
		expect(() => resolveReplay(manifest(), checkpoints(), "grill")).toThrow(
			/discuss, plan, build/u,
		);
	});

	it("refuses to replay past the point the run reached", () => {
		const partial = checkpoints();
		partial.delete("plan");

		expect(() => resolveReplay(manifest(), partial, "build")).toThrow(
			/no checkpoint for the plan stage/u,
		);
	});

	it("refuses a checkpoint chain that does not link back to the root", () => {
		const forged = checkpoints();
		forged.set("plan", record("plan", "lin-2", "lin-forged"));

		expect(() => resolveReplay(manifest(), forged, "build")).toThrow(
			/chain is broken at the plan stage/u,
		);
	});

	it("carries the whole consumed chain, in order, for staleness", () => {
		const plan = resolveReplay(manifest(), checkpoints(), "build");

		expect(plan.chain.map(({ stage }) => stage)).toEqual([
			"initial",
			"discuss",
			"plan",
		]);
	});

	it("carries only the initial checkpoint when replaying the first stage", () => {
		const plan = resolveReplay(manifest(), checkpoints(), "discuss");

		expect(plan.chain.map(({ stage }) => stage)).toEqual(["initial"]);
	});
});

describe(runReplay.name, () => {
	const SPEC_CONTENT = "the spec\n";
	const SPEC_PATH = "backlog/docs/DOC-1 - spec.md";

	interface RecordedRun {
		readonly paths: ReturnType<typeof benchmarkRunPaths>;
		readonly manifest: RunManifest;
		readonly initial: CheckpointRecord;
		readonly discuss: CheckpointRecord;
		readonly build: CheckpointRecord;
	}

	async function recordedRun(
		discussCorpus: readonly HashedFile[] = [],
	): Promise<RecordedRun> {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-replayrun-"));
		testResources.track(directory);
		const paths = benchmarkRunPaths(directory, "run");
		const stateDir = join(directory, "state");
		await mkdir(join(stateDir, "backlog", "docs"), { recursive: true });
		await Bun.write(join(stateDir, "backlog", "config.yml"), "statuses: []\n");
		const initial = await recordCheckpoint(
			stateDir,
			paths.checkpointDirectory("initial"),
			{
				stage: "initial",
				targetSha: "task-sha",
				upstream: "root-key",
				model: "sonnet",
				corpusFiles: [],
				artifacts: [],
			},
		);
		await Bun.write(join(stateDir, SPEC_PATH), SPEC_CONTENT);
		const discuss = await recordCheckpoint(
			stateDir,
			paths.checkpointDirectory("discuss"),
			{
				stage: "discuss",
				targetSha: "task-sha",
				upstream: initial.lineage,
				model: "sonnet",
				corpusFiles: discussCorpus,
				artifacts: [
					{
						path: SPEC_PATH,
						sha256: createHash("sha256").update(SPEC_CONTENT).digest("hex"),
					},
				],
			},
		);
		const build = await recordCheckpoint(
			stateDir,
			paths.checkpointDirectory("build"),
			{
				stage: "build",
				targetSha: "candidate-sha",
				upstream: discuss.lineage,
				model: "sonnet",
				corpusFiles: [
					{
						path: "skills/build/SKILL.md",
						sha256: createHash("sha256").update("build").digest("hex"),
					},
				],
				artifacts: [],
			},
		);
		const manifest: RunManifest = {
			caseId: "audit-log",
			timestamp: "2026-08-30T00:00:00.000Z",
			controlSha: "run-control-sha",
			sourceRoot: join(directory, "primary"),
			sourceSha: "source-sha",
			taskId: "TASK-1",
			taskSha: "task-sha",
			task: "Task text",
			productBrief: "Brief text",
			model: "sonnet",
			judgeModel: "sonnet",
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
					{
						name: "build",
						kind: "delivery",
						skill: "build",
						rubric: "rubrics/build.json",
					},
					{
						name: "review",
						kind: "delivery",
						skill: "review",
						rubric: "rubrics/review.json",
					},
				],
			},
		};
		await writeRunManifest(paths.manifestFile, manifest);

		return {
			paths,
			manifest,
			initial,
			discuss,
			build,
		};
	}

	function request(
		run: Awaited<ReturnType<typeof recordedRun>>,
		stage: string,
	): ReplayRequest {
		return {
			paths: run.paths,
			stage,
			instructions: "Current instructions",
			corpusSource: { kind: "live", root: "/live", backingRoot: "/backing" },
			controlSha: "control-sha",
			model: "sonnet",
			judgeModel: "opus",
			sessionBudgetUsd: 5,
		};
	}

	/**
	 * A project-level skill shadows the user-level one under
	 * --setting-sources project, so a replay given a corpus source tells the
	 * session to read the frozen bytes rather than the live install.
	 */
	it("runs the stage under project setting sources when given a corpus", async () => {
		const run = await recordedRun();
		const fake = new ReplayConfirmationHarness(testResources);

		await runReplay(fake.dependencies, {
			...request(run, "build"),
			settingSources: "project",
		});

		expect(fake.settingSources).toEqual(["project"]);
	});

	it("passes a declared settings overlay through to the stage session", async () => {
		const run = await recordedRun();
		const fake = new ReplayConfirmationHarness(testResources);

		await runReplay(fake.dependencies, {
			...request(run, "build"),
			loadedSettings: {
				json: '{"disableAllHooks":true}',
				hashed: { path: "stage-settings.json", sha256: "a".repeat(64) },
			},
		});

		expect(fake.settingsOverlays).toEqual(['{"disableAllHooks":true}']);
	});

	it("leaves the settings overlay unset when none is given", async () => {
		const run = await recordedRun();
		const fake = new ReplayConfirmationHarness(testResources);

		await runReplay(fake.dependencies, request(run, "build"));

		expect(fake.settingsOverlays).toEqual([undefined]);
	});

	it("installs the corpus snapshot into the worktree before the stage runs", async () => {
		const run = await recordedRun();
		const fake = new ReplayConfirmationHarness(testResources);

		await runReplay(fake.dependencies, {
			...request(run, "build"),
			corpusSource: { kind: "directory", root: "/frozen/corpus" },
		});

		expect(fake.corpusInstalls).toEqual([
			{
				snapshotDirectory: "/frozen/corpus",
				targetDirectory: fake.worktrees[0]?.path ?? "",
			},
		]);
	});

	it("replays a linked directory variant with the captured paths and hashes", async () => {
		const sourceRoot = await mkdtemp(join(tmpdir(), "rehearse-variant-"));
		testResources.track(sourceRoot);
		const instructions = "variant instructions";
		await Bun.write(join(sourceRoot, "CLAUDE.md"), instructions);
		for (const skill of ["discuss", "build"]) {
			await Bun.write(join(sourceRoot, "skills", skill, "SKILL.md"), skill);
		}
		await Bun.write(join(sourceRoot, "shared", "review.md"), "variant agent");
		await symlink(join(sourceRoot, "shared"), join(sourceRoot, "agents"));
		const source = { kind: "directory", root: sourceRoot } as const;
		const expected = await captureStageCorpus("build", instructions, [source]);
		const run = await recordedRun(
			await captureStageCorpus("discuss", instructions, [source]),
		);
		const fake = new ReplayConfirmationHarness(testResources);

		const outcome = await runReplay(
			{
				...fake.dependencies,
				installStageCorpusSnapshot,
				stageSession: { ...fake.dependencies.stageSession, captureStageCorpus },
			},
			{
				...request(run, "build"),
				instructions,
				corpusSource: source,
			},
		);

		expect(outcome.record.corpusFiles).toEqual(expected);
		expect(outcome.record.staleness).toEqual([]);
	});

	it("leaves setting sources unset when no corpus is given", async () => {
		const run = await recordedRun();
		const fake = new ReplayConfirmationHarness(testResources);

		await runReplay(fake.dependencies, request(run, "build"));

		expect(fake.settingSources).toEqual([undefined]);
	});

	it("replays a delivery stage in the worktree and never touches the primary", async () => {
		const run = await recordedRun();
		const fake = new ReplayConfirmationHarness(testResources);
		const config = parseReplayArgs(
			[
				"--run",
				run.paths.name,
				"--stage",
				"build",
				"--model",
				"sonnet",
				"--session-budget-usd",
				"5",
			],
			{},
		);

		const outcome = await runReplay(fake.dependencies, {
			...request(run, "build"),
			model: config.model,
			judgeModel: config.judgeModel,
		});

		const [worktree] = fake.worktrees;
		expect(worktree?.root).toBe(run.manifest.sourceRoot);
		expect(worktree?.sha).toBe(run.discuss.targetSha);
		expect(fake.stageDirs.length).toBeGreaterThan(0);
		expect(fake.stageDirs.every((dir) => dir === worktree?.path)).toBe(true);
		expect(fake.branchExpectations).toEqual([null]);
		expect(fake.installed).toEqual([worktree?.path ?? ""]);
		expect(fake.integrityFileSets).toEqual([
			run.manifest.pipeline.target.integrityFiles,
		]);
		expect(fake.targetChecks).toEqual([run.manifest.pipeline.target.checks]);
		expect(fake.removed).toEqual([worktree?.path ?? ""]);
		expect(fake.judged[0]?.priorArtifacts).toEqual([
			{ path: SPEC_PATH, content: SPEC_CONTENT },
		]);
		expect(fake.judged[0]?.commitSubjects).toEqual(["replayed commit"]);
		expect(outcome.record.consumed).toEqual({
			stage: "discuss",
			lineage: run.discuss.lineage,
			targetSha: "task-sha",
		});
		expect(outcome.record.lineage).toBe(
			lineageKey({
				upstream: run.discuss.lineage,
				corpusFiles: [
					{
						path: "skills/build/SKILL.md",
						sha256: createHash("sha256").update("build").digest("hex"),
					},
				],
				model: "sonnet",
			}),
		);
		expect(outcome.record.stageCostUsd).toBe(1.25);
		expect(outcome.record.judgeCostUsd).toBe(0.5);
		expect({
			model: outcome.record.model,
			judgeModel: outcome.record.judgeModel,
		}).toEqual({ model: "sonnet", judgeModel: "opus" });
		expect(outcome.record.resultSha).toBe("result-sha");
		expect(outcome.record.scorecard.input.commitSubjects).toEqual([
			"replayed commit",
		]);
		expect(outcome.recordPath.startsWith(run.paths.replaysDirectory)).toBe(
			true,
		);
		expect(outcome.recordPath).toContain(run.discuss.lineage);
	});

	it("writes a record that validates against the replay schema", async () => {
		const run = await recordedRun();
		const fake = new ReplayConfirmationHarness(testResources);

		const outcome = await runReplay(fake.dependencies, request(run, "build"));

		const record = await readReplayRecord(outcome.recordPath);
		expect(record.replay).toBe(true);
		expect(record.consumed.lineage).toBe(run.discuss.lineage);
		expect(record.corpusFiles.length).toBeGreaterThan(0);
		expect(record.scorecard.grade.verdict).toBe("CONTINUE");
	});

	it("records what the replayed stage declared and loaded, with roles", async () => {
		const run = await recordedRun();
		const fake = new ReplayConfirmationHarness(testResources);
		const projectsDirectory = await mkdtemp(
			join(tmpdir(), "rehearse-projects-"),
		);
		testResources.track(projectsDirectory);
		const runWorkflowStage: ReplayDependencies["stageSession"]["runWorkflowStage"] =
			async (options) => {
				const slug = join(projectsDirectory, projectSlug(options.targetDir));
				await mkdir(slug, { recursive: true });
				await Bun.write(
					join(slug, "session.jsonl"),
					JSON.stringify({
						type: "assistant",
						message: {
							content: [
								{
									type: "tool_use",
									id: "t",
									name: "Read",
									input: {
										file_path: join(
											options.targetDir,
											".claude/skills/build/SKILL.md",
										),
									},
								},
							],
						},
					}),
				);

				return fake.dependencies.stageSession.runWorkflowStage(options);
			};

		const outcome = await runReplay(
			{
				...fake.dependencies,
				stageSession: { ...fake.dependencies.stageSession, runWorkflowStage },
				projectsDirectory,
			},
			request(run, "build"),
		);

		const record = await readReplayRecord(outcome.recordPath);
		expect(
			record.readManifest?.map(({ path, role, evidence }) => ({
				path,
				role,
				evidence,
			})),
		).toEqual([
			{ path: "CLAUDE.md", role: "global instructions", evidence: "declared" },
			{
				path: "skills/build/SKILL.md",
				role: "stage skill",
				evidence: "declared and observed",
			},
			{
				path: "rubrics/build.json",
				role: "judge rubric",
				evidence: "declared",
			},
		]);
		expect(record.readManifest?.[2]?.sha256).toBe(
			stageRubricSha256(outcome.record.scorecard.rubric),
		);
	});

	it("records the corpus version its stage session measured", async () => {
		const run = await recordedRun();
		const fake = new ReplayConfirmationHarness(testResources);
		const measured: CorpusMeasurement = {
			kind: "version",
			digest: "d".repeat(64),
		};

		const outcome = await runReplay(
			{
				...fake.dependencies,
				stageSession: {
					...fake.dependencies.stageSession,
					measureCorpus: () => Promise.resolve(measured),
				},
			},
			request(run, "build"),
		);
		const record = await readReplayRecord(outcome.recordPath);

		expect(record.corpusVersion).toEqual(measured);
	});

	it("names its record by the short id it claimed before its session ran", async () => {
		const run = await recordedRun();
		const fake = new ReplayConfirmationHarness(testResources);

		const outcome = await runReplay(fake.dependencies, request(run, "build"));

		expect(await readShortIds(run.paths.runsDirectory, "audit-log")).toEqual([
			{
				shortId: "audit-log/r1",
				record: {
					kind: "attempt:stage",
					lineage: run.discuss.lineage,
					timestamp: runNameFromTimestamp(outcome.record.timestamp),
				},
			},
		]);
	});

	describe("when the replay fails before its record is written", () => {
		it("leaves its short id naming nothing, and the next claim above it", async () => {
			const run = await recordedRun();
			const fake = new ReplayConfirmationHarness(testResources);
			const failing = {
				...fake.dependencies,
				runStageJudge: () => Promise.reject(new Error("judge died")),
			};

			await failureOf(runReplay(failing, request(run, "build")));
			testResources.track(dirname(fake.worktrees[0]?.path ?? "missing"));
			const next = await runReplay(fake.dependencies, request(run, "build"));
			const named = await readShortIds(run.paths.runsDirectory, "audit-log");

			expect(named.map(({ shortId, record }) => [shortId, record])).toEqual([
				[
					"audit-log/r2",
					{
						kind: "attempt:stage",
						lineage: run.discuss.lineage,
						timestamp: runNameFromTimestamp(next.record.timestamp),
					},
				],
			]);
		});
	});

	it("retains the stage scorecard's Judge attempts", async () => {
		const run = await recordedRun();
		const fake = new ReplayConfirmationHarness(testResources);
		const attempts: readonly JudgeAttempt[] = [
			{
				payload: { summary: "accepted replay" },
				costUsd: 0.5,
				outcome: "ACCEPTED",
			},
		];
		const recording = {
			...fake.dependencies,
			runStageJudge: (
				_model: string | undefined,
				_effort: undefined | "low" | "medium" | "high" | "xhigh" | "max",
				_budget: number,
				input: StageJudgeInput,
			) => Promise.resolve({ ...replayScorecard(input), attempts }),
		};

		const outcome = await runReplay(recording, request(run, "build"));
		const record = await readReplayRecord(outcome.recordPath);

		expect(record.scorecard["attempts"]).toEqual(attempts);
	});

	it("records the replayed stage's elapsed time, from its session to its judge's grade", async () => {
		const run = await recordedRun();
		const fake = new ReplayConfirmationHarness(testResources);
		let clockMs = 1000;
		const timed = {
			...fake.dependencies,
			now: () => clockMs,
			stageSession: {
				...fake.dependencies.stageSession,
				runWorkflowStage: (
					input: Parameters<
						typeof fake.dependencies.stageSession.runWorkflowStage
					>[0],
				) => {
					clockMs += 2000;

					return fake.dependencies.stageSession.runWorkflowStage(input);
				},
			},
			runStageJudge: (
				_model: string | undefined,
				_effort: undefined | "low" | "medium" | "high" | "xhigh" | "max",
				_budget: number,
				input: StageJudgeInput,
			) => {
				clockMs += 3000;

				return Promise.resolve(replayScorecard(input));
			},
		};

		const outcome = await runReplay(timed, request(run, "build"));
		const record = await readReplayRecord(outcome.recordPath);

		expect(record.elapsedMs).toBe(5000);
	});

	it("replays the first stage from the initial checkpoint without installing dependencies", async () => {
		const run = await recordedRun();
		const fake = new ReplayConfirmationHarness(testResources);

		const outcome = await runReplay(fake.dependencies, request(run, "discuss"));

		expect(outcome.record.consumed.stage).toBe("initial");
		expect(fake.installed).toEqual([]);
		expect(fake.branchExpectations).toEqual([null]);
		expect(fake.judged[0]?.priorArtifacts).toEqual([]);
	});

	it("records a STOP verdict as a result and still removes the worktree", async () => {
		const run = await recordedRun();
		const fake = new ReplayConfirmationHarness(testResources);
		const stopping = {
			...fake.dependencies,
			runStageJudge: (
				_model: string | undefined,
				_effort: undefined | "low" | "medium" | "high" | "xhigh" | "max",
				_budget: number,
				input: StageJudgeInput,
			) => Promise.resolve(replayScorecard(input, "STOP")),
		};

		const outcome = await runReplay(stopping, request(run, "build"));

		expect(outcome.record.scorecard.grade.verdict).toBe("STOP");
		expect(fake.removed).toHaveLength(1);
	});

	it("keeps the worktree and prints its path when the replay fails before grading", async () => {
		const run = await recordedRun();
		const fake = new ReplayConfirmationHarness(testResources);
		const failing = {
			...fake.dependencies,
			runStageJudge: () => Promise.reject(new Error("judge died")),
		};

		expect(runReplay(failing, request(run, "build"))).rejects.toThrow(
			"judge died",
		);

		expect(fake.removed).toEqual([]);
		const preserved = fake.log.find((line) =>
			line.includes("evidence preserved at"),
		);
		expect(preserved).toContain(fake.worktrees[0]?.path ?? "missing");
		testResources.track(dirname(fake.worktrees[0]?.path ?? "missing"));
	});

	it("fails loudly when the run predates initial checkpoints", async () => {
		const run = await recordedRun();
		await rm(run.paths.checkpointDirectory("initial"), {
			force: true,
			recursive: true,
		});
		const fake = new ReplayConfirmationHarness(testResources);

		expect(
			runReplay(fake.dependencies, request(run, "discuss")),
		).rejects.toThrow(/no initial checkpoint/u);
		expect(fake.worktrees).toEqual([]);
	});

	it("records the replay fresh when the corpus still matches the chain", async () => {
		const run = await recordedRun([
			{
				path: "skills/discuss/SKILL.md",
				sha256: createHash("sha256").update("discuss").digest("hex"),
			},
		]);
		const fake = new ReplayConfirmationHarness(testResources);

		const outcome = await runReplay(fake.dependencies, request(run, "build"));

		expect(outcome.record.stale).toBe(false);
		expect(outcome.record.staleness).toEqual([]);
	});

	it("prints when the checkpoint chain is fresh", async () => {
		const run = await recordedRun([
			{
				path: "skills/discuss/SKILL.md",
				sha256: createHash("sha256").update("discuss").digest("hex"),
			},
		]);
		const fake = new ReplayConfirmationHarness(testResources);

		await runReplay(fake.dependencies, request(run, "build"));

		expect(
			fake.log.filter((line) => line === "Checkpoint chain is fresh"),
		).toEqual(["Checkpoint chain is fresh"]);
	});

	it("derives staleness from the request's instructions and the worktree's skills", async () => {
		const run = await recordedRun([
			{
				path: "skills/discuss/SKILL.md",
				sha256: createHash("sha256").update("discuss").digest("hex"),
			},
		]);
		const fake = new ReplayConfirmationHarness(testResources);

		await runReplay(fake.dependencies, request(run, "build"));

		const worktree = fake.worktrees[0]?.path ?? "missing";
		const upstream = fake.corpusCaptures.find(
			({ skill }) => skill === "discuss",
		);
		expect(upstream?.instructions).toBe("Current instructions");
		expect(upstream?.roots).toEqual(
			corpusLayoutRoots(worktree, {
				kind: "live",
				root: "/live",
				backingRoot: "/backing",
			}),
		);
	});

	it("records the replay stale and names the changed upstream file", async () => {
		const run = await recordedRun([
			{ path: "skills/discuss/SKILL.md", sha256: "aa".repeat(32) },
		]);
		const fake = new ReplayConfirmationHarness(testResources);

		const outcome = await runReplay(fake.dependencies, request(run, "build"));

		expect(outcome.record.stale).toBe(true);
		expect(outcome.record.staleness).toEqual([
			{ stage: "discuss", causes: ["skills/discuss/SKILL.md changed"] },
		]);
	});

	it("prints every stale checkpoint when the chain is stale", async () => {
		const run = await recordedRun([
			{ path: "skills/discuss/SKILL.md", sha256: "aa".repeat(32) },
		]);
		const fake = new ReplayConfirmationHarness(testResources);

		await runReplay(fake.dependencies, request(run, "review"));

		expect(
			fake.log.filter(
				(line) =>
					line === "Checkpoint chain is fresh" ||
					line.startsWith("Stale checkpoint "),
			),
		).toEqual([
			"Stale checkpoint discuss: skills/discuss/SKILL.md changed",
			"Stale checkpoint build: upstream stage discuss is stale",
		]);
	});

	it("labels the replay stale when the model differs from the recorded run", async () => {
		const run = await recordedRun();
		const fake = new ReplayConfirmationHarness(testResources);

		const outcome = await runReplay(fake.dependencies, {
			...request(run, "build"),
			model: "opus",
		});

		expect(outcome.record.stale).toBe(true);
		expect(outcome.record.staleness?.[0]?.causes).toContain(
			"model sonnet is now opus",
		);
	});

	it("leaves the replay fresh when only the replayed stage's own skill changed", async () => {
		const run = await recordedRun([
			{
				path: "skills/discuss/SKILL.md",
				sha256: createHash("sha256").update("discuss").digest("hex"),
			},
		]);
		const fake = new ReplayConfirmationHarness(testResources);

		const outcome = await runReplay(fake.dependencies, request(run, "discuss"));

		expect(outcome.record.stale).toBe(false);
	});

	it("writes a stale record that still validates against the replay schema", async () => {
		const run = await recordedRun([
			{ path: "skills/discuss/SKILL.md", sha256: "aa".repeat(32) },
		]);
		const fake = new ReplayConfirmationHarness(testResources);

		const outcome = await runReplay(fake.dependencies, request(run, "build"));

		const record = await readReplayRecord(outcome.recordPath);
		expect(record.stale).toBe(true);
		expect(record.staleness?.[0]?.stage).toBe("discuss");
	});

	it("replays end to end against a real repository, leaving the primary untouched", async () => {
		const parent = await mkdtemp(join(tmpdir(), "rehearse-real-replay-"));
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
			"backlog/\n.boris/\nnode_modules/\n",
		);
		await Bun.write(join(primary, "base.txt"), "base\n");
		await commitAll(primary, "chore: base");
		const taskSha = await currentSha(primary);
		await mkdir(join(primary, "backlog", "docs"), { recursive: true });
		await Bun.write(join(primary, "backlog", "config.yml"), "statuses: []\n");
		const paths = benchmarkRunPaths(parent, "run");
		await recordCheckpoint(
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
			),
		);
		const manifest: RunManifest = {
			caseId: "audit-log",
			timestamp: "2026-08-30T00:00:00.000Z",
			controlSha: "run-control-sha",
			sourceRoot: primary,
			sourceSha: taskSha,
			taskId: "TASK-1",
			taskSha,
			task: "Task text",
			productBrief: "Brief text",
			model: "sonnet",
			judgeModel: "sonnet",
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
						rubric: `${AUDIT_LOG_RUBRICS_PATH}/shape.json`,
						requiresAcceptanceCriteria: false,
					},
					{
						name: "build",
						kind: "delivery",
						skill: "build",
						rubric: `${AUDIT_LOG_RUBRICS_PATH}/build.json`,
					},
				],
			},
		};
		await writeRunManifest(paths.manifestFile, manifest);
		const before = {
			head: await runCommand(["git", "rev-parse", "HEAD"], primary),
			branch: await runCommand(["git", "branch", "--show-current"], primary),
			status: await runCommand(["git", "status", "--porcelain"], primary),
		};

		const judged: StageJudgeInput[] = [];
		const outcome = await runReplay(
			{
				createProductOwner,
				stageSession: {
					runWorkflowStage: async ({ targetDir, stage }) => {
						await Bun.write(
							join(targetDir, "backlog", "docs", "DOC-1 - replay-spec.md"),
							"replayed spec\n",
						);

						return {
							stage,
							sessionId: "session",
							costUsd: 0.9,
							providerCalls: [],
							exchanges: [],
						};
					},
					readTaskOutput: () =>
						Promise.resolve(
							JSON.stringify({
								task: {
									acceptanceCriteria: ["done"],
									documentation: ["DOC-1 - replay-spec.md"],
								},
							}),
						),
					readTaskCard: () => Promise.resolve("the replayed task card"),
					captureBuildCandidate: () =>
						Promise.reject(new Error("not a delivery stage")),
					assertPlanningStageCompleted,
					assertBuildCommitted: () =>
						Promise.reject(new Error("not a delivery stage")),
					changedPathsBetween: () => Promise.resolve([]),
					captureCheckIntegrity: () =>
						Promise.resolve(harnessResult("PASS", "checks match")),
					captureTreatmentChecks: () =>
						Promise.resolve(harnessResult("PASS", "all green")),
					captureStageCorpus: (skill) =>
						Promise.resolve([
							{
								path: `skills/${skill}/SKILL.md`,
								sha256: createHash("sha256").update(skill).digest("hex"),
							},
						]),
					measureCorpus: () =>
						Promise.resolve({ kind: "version", digest: "c".repeat(64) }),
				},
				runStageJudge: async (_model, _effort, _budget, input) => {
					judged.push(input);

					const loaded = await loadStageRubric(
						manifest.pipeline.stages[0] ?? {
							name: "discuss",
							kind: "planning",
							skill: "discuss",
							artifact: "spec",
							rubric: "rubrics/shape.json",
							requiresAcceptanceCriteria: false,
						},
					);

					return {
						stage: input.stage,
						rubricPath: "rubrics/discuss.json",
						rubric: loaded.rubric,
						input,
						prompt: "prompt",
						attempts: [],
						costUsd: 0.4,
						grade: {
							hardBlockers: [],
							requirements: [],
							dimensions: [],
							summary: "graded",
							grade: "A",
							verdict: "CONTINUE",
						},
					};
				},
				loadStageRubric,
				addWorktree,
				removeWorktree,
				materializeCheckpoint,
				captureBaselineContext,
				captureFileHashes,
				currentSha,
				installDependencies: () =>
					Promise.reject(new Error("not a delivery stage")),
				installStageCorpusSnapshot: () =>
					Promise.reject(new Error("no corpus source")),
				log: () => undefined,
			},
			{
				paths,
				stage: "discuss",
				instructions: "Replayed instructions\n",
				corpusSource: { kind: "live", root: "/live", backingRoot: "/backing" },
				controlSha: "control-sha",
				model: "sonnet",
				judgeModel: "opus",
				sessionBudgetUsd: 5,
			},
		);

		const after = {
			head: await runCommand(["git", "rev-parse", "HEAD"], primary),
			branch: await runCommand(["git", "branch", "--show-current"], primary),
			status: await runCommand(["git", "status", "--porcelain"], primary),
		};
		expect(after).toEqual(before);
		const worktrees = await runCommand(
			["git", "worktree", "list", "--porcelain"],
			primary,
		);
		expect(
			worktrees.split("\n").filter((line) => line.startsWith("worktree ")),
		).toHaveLength(1);
		const record = await readReplayRecord(outcome.recordPath);
		expect(record.consumed.stage).toBe("initial");
		expect(record.baseSha).toBe(taskSha);
		expect(judged[0]?.artifact?.content).toBe("replayed spec\n");
		expect(
			await presentAttempts(
				record.consumed.lineage,
				await loadAttempts(
					benchmarkRunPaths(parent, "run"),
					"discuss",
					record.consumed.lineage,
				),
			),
		).toContain("replay ");
	});
});
