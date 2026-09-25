import { failureOf } from "#cli/cli-test-support";
import { confirmationGroupPaths } from "./run-layout";
import { SymlinkedEntryError } from "./file-presence";
import { describe, expect, it } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readdir,
	realpath,
	stat,
	symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import type { ConfirmationRepRecord } from "./confirmation-record";
import {
	confirmationRepRecordSchema,
	parseConfirmationGroupRecord,
} from "./confirmation-record";
import { parseCheckpointRecord } from "./checkpoint";
import { runCommand } from "./command";
import { stageRubricSha256 } from "./judge-agreement";
import type { ReadManifestEntry } from "./read-manifest";
import { readManifestSchema } from "./read-manifest";
import type { CorpusMeasurement } from "./corpus-measurement";
import { parseArgs } from "./config";
import {
	JudgeExecutionError,
	JudgeOutputValidationError,
} from "./judge-attempt";
import type { TargetCheck } from "./pipeline";
import { runPipelineConfirmation } from "./pipeline-confirmation";
import { projectSlug } from "./session-capture";
import { readShortIds } from "./short-id";
import {
	CONFIRMATION_METRIC,
	CONFIRMATION_PIPELINE,
	CONFIRMATION_STAGE_RUBRIC,
	PipelineConfirmationHarness,
	completeFinalGrade,
	pipelineStageScorecard,
} from "./pipeline-confirmation-test-support";
import { removeWorktree } from "./target";
import { AUDIT_LOG_PIPELINE_PATH, TestResources } from "./test-support";
import { WorkflowExecutionError } from "./workflow";

const testResources = TestResources.forEachTest();

function parseConfirmationRepRecord(text: string): ConfirmationRepRecord {
	return confirmationRepRecordSchema.parse(JSON.parse(text));
}

describe(runPipelineConfirmation.name, () => {
	it("refuses a foreign layout before creating a repetition", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);
		const outside = join(harness.runsDirectory, "foreign");
		await Bun.write(join(outside, "private.md"), "foreign bytes\n");
		await symlink(outside, join(harness.corpusRoot, "agents"));

		const failure = await failureOf(harness.run({}));

		expect(failure).toBeInstanceOf(SymlinkedEntryError);
		expect(harness.retained.size).toBe(0);
		const group = confirmationGroupPaths(
			harness.runsDirectory,
			"pipeline-confirmation-1",
		);
		expect(await readdir(group.directory)).not.toContain("reps");
	});

	it("claims no short id when its inputs are refused", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);
		const outside = join(harness.runsDirectory, "foreign");
		await Bun.write(join(outside, "private.md"), "foreign bytes\n");
		await symlink(outside, join(harness.corpusRoot, "agents"));

		await failureOf(harness.run({ caseId: "audit-log-follow-up" }));

		expect(
			await readShortIds(harness.runsDirectory, "audit-log-follow-up"),
		).toEqual([]);
	});

	it("records the resolved Judge model in pipeline confirmation evidence", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);
		const config = parseArgs(
			[
				"--target",
				harness.sourceRoot,
				"--model",
				"sonnet",
				"--session-budget-usd",
				"5",
			],
			{},
			{
				caseId: "audit-log",
				pipelinePath: AUDIT_LOG_PIPELINE_PATH,
				targetPath: harness.sourceRoot,
			},
		);

		const outcome = await harness.run({
			model: config.model,
			judgeModel: config.judgeModel,
		});
		const group = parseConfirmationGroupRecord(
			await Bun.file(outcome.groupRecordFile).text(),
		);

		expect({
			model: group.inputs.model,
			judgeModel: group.inputs.judgeModel,
		}).toEqual({ model: "sonnet", judgeModel: "opus" });
	});

	it("names the case its group and rep records ran", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);

		const outcome = await harness.run({ caseId: "audit-log-follow-up" });
		const group = parseConfirmationGroupRecord(
			await Bun.file(outcome.groupRecordFile).text(),
		);
		const reps = await Promise.all(
			outcome.repRecordFiles.map(async (file) =>
				parseConfirmationRepRecord(await Bun.file(file).text()),
			),
		);

		expect(group.caseId).toBe("audit-log-follow-up");
		expect(reps.map(({ caseId }) => caseId)).toEqual(
			reps.map(() => "audit-log-follow-up"),
		);
	});

	it("claims the group a short id in its case", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);

		const outcome = await harness.run({ caseId: "audit-log-follow-up" });
		const group = parseConfirmationGroupRecord(
			await Bun.file(outcome.groupRecordFile).text(),
		);

		expect(
			await readShortIds(harness.runsDirectory, "audit-log-follow-up"),
		).toEqual([
			{
				shortId: "audit-log-follow-up/g1",
				record: { kind: "group", groupId: group.groupId },
			},
		]);
	});

	it("reports agreement only for its exact Judge model", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);
		const calibrationArtifact = {
			status: "COMPLETE",
			rubric: "1. `final`: pass the candidate\n",
			grade: completeFinalGrade("PASS"),
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
				join(harness.runsDirectory, "opus.json"),
				JSON.stringify({ ...calibrationArtifact, judgeModel: "opus" }),
			),
			Bun.write(
				join(harness.runsDirectory, "sonnet.json"),
				JSON.stringify({ ...calibrationArtifact, judgeModel: "sonnet" }),
			),
		]);

		const outcome = await harness.run({ judgeModel: "opus" });
		const report = z
			.object({
				judgeAgreement: z.object({
					skippedCalibrations: z.number(),
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

		expect(report.judgeAgreement.baselines).toEqual([
			{
				judgeModel: "opus",
				criteria: [
					{ rubricId: "check-integrity", sampleSize: 1 },
					{ rubricId: "local-checks", sampleSize: 1 },
					{ rubricId: "tests", sampleSize: 1 },
					{ rubricId: "worker", sampleSize: 1 },
				],
			},
		]);
	});

	it("uses the pipeline target before task setup or provider calls", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);
		const events: string[] = [];
		const target = {
			checks: [
				{ command: ["bun", "run", "first"] },
				{ command: ["bun", "run", "second"], env: { MODE: "strict" } },
			],
			integrityFiles: ["package.json"],
		};
		const pipeline = { ...CONFIRMATION_PIPELINE, target };
		let observedChecks: readonly TargetCheck[] | undefined;
		let observedIntegrityFiles: readonly string[] | undefined;
		const treatmentCheckSets: (readonly TargetCheck[])[] = [];

		const outcome = await harness.run({ pipeline }, (dependencies) => ({
			...dependencies,
			runChecks: (_targetDir, _label, checks) => {
				events.push("baseline checks");
				observedChecks = checks;

				return Promise.resolve();
			},
			captureFileHashes: (targetDir, integrityFiles) => {
				events.push("integrity baseline");
				observedIntegrityFiles = integrityFiles;

				return dependencies.captureFileHashes(targetDir, integrityFiles);
			},
			seedTaskBoard: (...args) => {
				events.push("task setup");

				return dependencies.seedTaskBoard(...args);
			},
			stageSession: {
				...dependencies.stageSession,
				captureTreatmentChecks: (targetDir, checks) => {
					treatmentCheckSets.push(checks);

					return dependencies.stageSession.captureTreatmentChecks(
						targetDir,
						checks,
					);
				},
				runWorkflowStage: (request) => {
					events.push("provider call");

					return dependencies.stageSession.runWorkflowStage(request);
				},
			},
		}));

		expect(observedChecks).toEqual(target.checks);
		expect(observedIntegrityFiles).toEqual(target.integrityFiles);
		expect(treatmentCheckSets).toEqual([
			target.checks,
			target.checks,
			target.checks,
		]);
		expect(events.slice(0, 3)).toEqual([
			"baseline checks",
			"integrity baseline",
			"task setup",
		]);
		expect(events.indexOf("provider call")).toBeGreaterThan(
			events.indexOf("task setup"),
		);
		const group = parseConfirmationGroupRecord(
			await Bun.file(outcome.groupRecordFile).text(),
		);
		const pipelineFile = group.inputs.files.find(
			({ kind }) => kind === "pipeline",
		);
		if (pipelineFile === undefined) {
			throw new Error("Expected a frozen pipeline input");
		}
		const frozenPipeline: unknown = JSON.parse(
			await Bun.file(
				join(dirname(outcome.groupRecordFile), pipelineFile.path),
			).text(),
		);
		expect(frozenPipeline).toMatchObject({ target });
	});

	const declaredSettings = {
		json: '{"disableAllHooks":true}',
		hashed: { path: "stage-settings.json", sha256: "a".repeat(64) },
	};

	it("hashes the declared settings file's digest into every checkpoint's own lineage field", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);

		const outcome = await harness.run({ loadedSettings: declaredSettings });
		const group = parseConfirmationGroupRecord(
			await Bun.file(outcome.groupRecordFile).text(),
		);
		const initialCheckpointFile = group.inputs.files.find(
			({ kind }) => kind === "checkpoint",
		);
		if (initialCheckpointFile === undefined) {
			throw new Error("Expected a frozen initial checkpoint");
		}
		const initialCheckpoint: unknown = JSON.parse(
			await Bun.file(
				join(dirname(outcome.groupRecordFile), initialCheckpointFile.path),
			).text(),
		);

		expect(initialCheckpoint).toMatchObject({
			settingsFile: { sha256: declaredSettings.hashed.sha256 },
		});
	});

	it("measures the corpus once for the group and records that version on the group and every rep stage", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);
		let measurements = 0;

		const outcome = await harness.run({}, (dependencies) => ({
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
		}));
		const groupDirectory = dirname(outcome.groupRecordFile);
		const group = parseConfirmationGroupRecord(
			await Bun.file(outcome.groupRecordFile).text(),
		);
		const repCheckpoints = await Array.fromAsync(
			new Bun.Glob("reps/**/checkpoint.json").scan(groupDirectory),
		);
		const recorded = await Promise.all(
			repCheckpoints.map(async (file) =>
				parseCheckpointRecord(
					await Bun.file(join(groupDirectory, file)).text(),
				),
			),
		);

		const groupVersion: CorpusMeasurement = {
			kind: "version",
			digest: "1".repeat(64),
		};
		expect(measurements).toBe(1);
		expect(group.inputs.corpusVersion).toEqual(groupVersion);
		expect(recorded).toHaveLength(
			group.reps * CONFIRMATION_PIPELINE.stages.length,
		);
		expect(recorded.map(({ corpusVersion }) => corpusVersion)).toEqual(
			recorded.map(() => groupVersion),
		);
	});

	it("records on every rep stage checkpoint a read manifest of its judge rubric and corpus files", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);

		const outcome = await harness.run({});
		const groupDirectory = dirname(outcome.groupRecordFile);
		const repCheckpoints = await Array.fromAsync(
			new Bun.Glob("reps/**/checkpoint.json").scan(groupDirectory),
		);
		const recorded = await Promise.all(
			repCheckpoints.map(async (file) =>
				parseCheckpointRecord(
					await Bun.file(join(groupDirectory, file)).text(),
				),
			),
		);

		expect(recorded).not.toHaveLength(0);
		for (const checkpoint of recorded) {
			expect(checkpoint.readManifest).toContainEqual({
				path: `rubrics/${checkpoint.stage}.json`,
				half: "rubric",
				role: "judge rubric",
				evidence: "declared",
				sha256: stageRubricSha256(CONFIRMATION_STAGE_RUBRIC),
			});
			expect(
				checkpoint.readManifest
					?.filter(({ half }) => half === "corpus")
					.map(({ path, sha256 }) => ({ path, sha256 })),
			).toEqual([...checkpoint.corpusFiles]);
		}
	});

	it("keeps on the stage file of a rep its judge stopped the read manifest of that stage", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);

		const outcome = await harness.run({}, (dependencies) => ({
			...dependencies,
			runStageJudge: (_model, _effort, _budget, input, source) => {
				const scorecard = pipelineStageScorecard(input, source);

				return Promise.resolve({
					...scorecard,
					grade: { ...scorecard.grade, grade: "F", verdict: "STOP" },
				});
			},
		}));
		const groupDirectory = dirname(outcome.groupRecordFile);
		const stageFiles = await Array.fromAsync(
			new Bun.Glob("reps/*/stages/discuss.json").scan(groupDirectory),
		);
		const recorded = await Promise.all(
			stageFiles.map(
				async (file) =>
					z
						.object({ readManifest: readManifestSchema })
						.parse(
							JSON.parse(await Bun.file(join(groupDirectory, file)).text()),
						).readManifest,
			),
		);

		const rubricEntry: ReadManifestEntry = {
			path: "rubrics/discuss.json",
			half: "rubric",
			role: "judge rubric",
			evidence: "declared",
			sha256: stageRubricSha256(CONFIRMATION_STAGE_RUBRIC),
		};
		expect(
			recorded.map((readManifest) =>
				readManifest.filter(({ half }) => half === "rubric"),
			),
		).toEqual([[rubricEntry], [rubricEntry], [rubricEntry]]);
	});

	it("marks a stage skill the rep's session was observed to read", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);
		const projectsDirectory = await mkdtemp(
			join(tmpdir(), "rehearse-projects-"),
		);
		testResources.track(projectsDirectory);

		const outcome = await harness.run({}, (dependencies) => ({
			...dependencies,
			projectsDirectory,
			stageSession: {
				...dependencies.stageSession,
				runWorkflowStage: async (request) => {
					const slug = join(
						projectsDirectory,
						projectSlug(await realpath(request.targetDir)),
					);
					await mkdir(slug, { recursive: true });
					await Bun.write(
						join(slug, `${request.stage}.jsonl`),
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
												request.targetDir,
												`.claude/skills/${request.stage}/SKILL.md`,
											),
										},
									},
								],
							},
						}),
					);

					return dependencies.stageSession.runWorkflowStage(request);
				},
			},
		}));
		const groupDirectory = dirname(outcome.groupRecordFile);
		const repCheckpoints = await Array.fromAsync(
			new Bun.Glob("reps/**/checkpoint.json").scan(groupDirectory),
		);
		const recorded = await Promise.all(
			repCheckpoints.map(async (file) =>
				parseCheckpointRecord(
					await Bun.file(join(groupDirectory, file)).text(),
				),
			),
		);

		expect(recorded).not.toHaveLength(0);
		for (const checkpoint of recorded) {
			expect(
				checkpoint.readManifest?.find(
					({ path }) => path === `skills/${checkpoint.stage}/SKILL.md`,
				),
			).toMatchObject({
				role: "stage skill",
				evidence: "declared and observed",
			});
		}
	});

	it("passes a declared settings overlay to every stage session", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);
		const overlays: (string | undefined)[] = [];

		await harness.run({ loadedSettings: declaredSettings }, (dependencies) => ({
			...dependencies,
			stageSession: {
				...dependencies.stageSession,
				runWorkflowStage: (request) => {
					overlays.push(request.settingsOverlay);

					return dependencies.stageSession.runWorkflowStage(request);
				},
			},
		}));

		expect(overlays.length).toBeGreaterThan(0);
		expect(overlays.every((overlay) => overlay === declaredSettings.json)).toBe(
			true,
		);
	});

	it("stops when a pipeline baseline check fails", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);
		const events: string[] = [];

		expect(
			harness.run({}, (dependencies) => ({
				...dependencies,
				runChecks: () => {
					events.push("baseline checks");

					return Promise.reject(new Error("baseline failed"));
				},
				seedTaskBoard: (...args) => {
					events.push("task setup");

					return dependencies.seedTaskBoard(...args);
				},
				stageSession: {
					...dependencies.stageSession,
					runWorkflowStage: (request) => {
						events.push("provider call");

						return dependencies.stageSession.runWorkflowStage(request);
					},
				},
			})),
		).rejects.toThrow("baseline failed");
		expect(events).toEqual(["baseline checks"]);
	});

	it("runs three frozen full-pipeline reps concurrently without changing the primary checkout", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);
		const allStarted = Promise.withResolvers<boolean>();
		const release = Promise.withResolvers<boolean>();
		const events = new Map<number, string[]>();
		const primaryBefore = await repositoryState(harness.sourceRoot);

		const execution = harness.run({}, (dependencies) => {
			const { stageSession } = dependencies;
			const { runWorkflowStage, captureStageCorpus } = stageSession;

			return {
				...dependencies,
				stageSession: {
					...stageSession,
					runWorkflowStage: async (request) => {
						const ordinal = repOrdinal(request.targetDir);
						const repEvents = events.get(ordinal) ?? [];
						repEvents.push(request.stage);
						events.set(ordinal, repEvents);
						if (request.stage === "discuss") {
							if (events.size === 3) {
								allStarted.resolve(true);
							}
							await release.promise;
						}

						const result = await runWorkflowStage(request);

						return {
							...result,
							sessionId: `${ordinal}-${request.stage}`,
						};
					},
					captureStageCorpus: async (skill, instructions, roots) => {
						await Bun.sleep(500);

						return captureStageCorpus(skill, instructions, roots);
					},
				},
				runFinalJudge: (request) => {
					const { ordinal } = request;
					const repEvents = events.get(ordinal) ?? [];
					repEvents.push("final");
					events.set(ordinal, repEvents);

					if (ordinal === 3) {
						return Promise.reject(
							new JudgeOutputValidationError({
								message: "Final Judge rejected both attempts",
								prompt: "final prompt",
								attempts: [
									{
										payload: { invalid: true },
										costUsd: CONFIRMATION_METRIC.costUsd,
										metrics: CONFIRMATION_METRIC,
										outcome: "REJECTED",
										error: "invalid output",
									},
								],
								costUsd: CONFIRMATION_METRIC.costUsd,
							}),
						);
					}

					const acceptedAttempt = {
						payload: { summary: "pass" },
						costUsd: CONFIRMATION_METRIC.costUsd,
						metrics: CONFIRMATION_METRIC,
						outcome: "ACCEPTED" as const,
					};

					return Promise.resolve({
						grade: completeFinalGrade("PASS"),
						prompt: "final prompt",
						attempts:
							ordinal === 2
								? [
										{
											payload: { invalid: true },
											costUsd: 0,
											outcome: "REJECTED" as const,
											error: "metrics unavailable",
										},
										acceptedAttempt,
									]
								: [acceptedAttempt],
						costUsd: CONFIRMATION_METRIC.costUsd,
					});
				},
			};
		});

		await allStarted.promise;
		expect(events.size).toBe(3);
		release.resolve(true);
		const outcome = await execution;
		const records = await Promise.all(
			outcome.repRecordFiles.map(async (path) =>
				parseConfirmationRepRecord(await Bun.file(path).text()),
			),
		);
		expect(records.map(({ outcome: result }) => result)).toEqual([
			"SUCCESSFUL",
			"UNSUCCESSFUL",
			"UNSUCCESSFUL",
		]);
		expect(records[1]?.metrics.status).toBe("MISSING");
		expect(records.every(({ stages }) => stages.length === 2)).toBe(true);
		expect(
			records.every(({ stages }) => {
				const [discuss] = stages;

				return discuss?.status === "JUDGED" && discuss.elapsedMs < 400;
			}),
		).toBe(true);
		expect(records.map(({ finalOutcome }) => finalOutcome.status)).toEqual([
			"JUDGED",
			"JUDGED",
			"EXECUTION_FAILED",
		]);
		expect(records[2]?.finalOutcome).toMatchObject({
			status: "EXECUTION_FAILED",
			error: "Final Judge rejected both attempts",
			evidence: { recordFile: "final.json" },
		});
		expect(
			harness.retained.get(
				"pipeline-confirmation-1/pipeline-confirmation-1-rep-3",
			),
		).toBe(
			records[2]?.finalOutcome.status === "EXECUTION_FAILED"
				? records[2].finalOutcome.evidence?.resultSha
				: undefined,
		);
		const successfulFinal = records[0]?.finalOutcome;
		if (successfulFinal?.status !== "JUDGED") {
			throw new Error("Expected a judged final outcome");
		}
		const [firstRecordFile] = outcome.repRecordFiles;
		if (firstRecordFile === undefined) {
			throw new Error("Expected the first rep record");
		}
		const finalEvidence = z
			.object({ grade: z.object({ verdict: z.literal("PASS") }) })
			.parse(
				JSON.parse(
					await Bun.file(
						join(dirname(firstRecordFile), successfulFinal.evidence.recordFile),
					).text(),
				),
			);
		expect(finalEvidence.grade.verdict).toBe("PASS");
		expect([...events.values()]).toEqual([
			["discuss", "build", "final"],
			["discuss", "build", "final"],
			["discuss", "build", "final"],
		]);
		const group = parseConfirmationGroupRecord(
			await Bun.file(outcome.groupRecordFile).text(),
		);
		expect(group.mode).toBe("pipeline");
		expect(group.declaredStages).toEqual(["discuss", "build"]);
		expect(await repositoryState(harness.sourceRoot)).toEqual(primaryBefore);
		const worktrees = await runCommand(
			["git", "worktree", "list", "--porcelain"],
			harness.sourceRoot,
		);
		expect(
			worktrees.split("\n").filter((line) => line.startsWith("worktree ")),
		).toHaveLength(1);
		const [firstRecord] = records;
		if (firstRecord === undefined) {
			throw new Error("Expected the first confirmation record");
		}
		const temporaryRootExists = await stat(
			dirname(firstRecord.worktreePath),
		).then(
			() => true,
			() => false,
		);
		expect(temporaryRootExists).toBe(false);
	});

	it("retains earlier pipeline worker metrics when a later stage omits them", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);

		const outcome = await harness.run(
			{
				groupId: "pipeline-metrics",
				reps: 2,
				projectedCost: {
					reps: 2,
					perRepMaximumUsd: 45,
					totalMaximumUsd: 90,
				},
			},
			(dependencies) => {
				const { stageSession } = dependencies;
				const { runWorkflowStage } = stageSession;

				return {
					...dependencies,
					stageSession: {
						...stageSession,
						runWorkflowStage: async (request) => {
							const result = await runWorkflowStage(request);
							if (request.stage === "discuss") {
								return result;
							}

							return { ...result, providerCalls: [{}] };
						},
					},
				};
			},
		);
		const [recordFile] = outcome.repRecordFiles;
		const record = parseConfirmationRepRecord(
			await Bun.file(recordFile ?? "missing").text(),
		);

		expect(record.metrics).toEqual({
			status: "MISSING",
			calls: [
				{ role: "worker", metrics: CONFIRMATION_METRIC },
				{ role: "stage-judge", metrics: CONFIRMATION_METRIC },
				{ role: "stage-judge", metrics: CONFIRMATION_METRIC },
				{ role: "final-judge", metrics: CONFIRMATION_METRIC },
			],
			missing: ["worker call metrics"],
		});
		expect(record.workerTrajectorySteps).toBe(CONFIRMATION_METRIC.turns);
	});

	it("runs the target's setup in every worktree before its checks", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);
		const setup = [{ command: ["bun", "install"] }];
		const pipeline = {
			...CONFIRMATION_PIPELINE,
			target: { ...CONFIRMATION_PIPELINE.target, setup },
		};
		const setupDirectories: string[] = [];
		const worktrees: string[] = [];

		await harness.run({ pipeline }, (dependencies) => ({
			...dependencies,
			addWorktree: (root, sha, path) => {
				worktrees.push(path);

				return dependencies.addWorktree(root, sha, path);
			},
			runSetup: (targetDir: string) => {
				setupDirectories.push(targetDir);

				return Promise.resolve();
			},
		}));

		expect(setupDirectories.toSorted()).toEqual(worktrees.toSorted());
	});

	it("retains worker calls carried by a failed stage execution", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);

		const outcome = await harness.run(
			{
				groupId: "worker-execution-metrics",
				reps: 2,
				projectedCost: {
					reps: 2,
					perRepMaximumUsd: 45,
					totalMaximumUsd: 90,
				},
			},
			(dependencies) => {
				const { stageSession } = dependencies;
				const { runWorkflowStage } = stageSession;

				return {
					...dependencies,
					stageSession: {
						...stageSession,
						runWorkflowStage: (request) => {
							if (
								request.stage === "discuss" &&
								repOrdinal(request.targetDir) === 1
							) {
								return Promise.reject(
									new WorkflowExecutionError({
										cause: new Error("worker invocation failed"),
										providerCalls: [{ metrics: CONFIRMATION_METRIC }, {}],
									}),
								);
							}

							return runWorkflowStage(request);
						},
					},
				};
			},
		);
		const records = await Promise.all(
			outcome.repRecordFiles.map(async (path) =>
				parseConfirmationRepRecord(await Bun.file(path).text()),
			),
		);
		const [failed] = records;
		testResources.track(dirname(failed?.worktreePath ?? "missing"));
		await removeWorktree(harness.sourceRoot, failed?.worktreePath ?? "missing");

		expect(failed?.stages[0]).toMatchObject({
			status: "EXECUTION_FAILED",
			error: "Worker execution failed: worker invocation failed",
		});
		expect(failed?.metrics).toEqual({
			status: "MISSING",
			calls: [{ role: "worker", metrics: CONFIRMATION_METRIC }],
			missing: ["worker call metrics", "stage-judge call metrics"],
		});
		expect(failed?.workerTrajectorySteps).toBe(CONFIRMATION_METRIC.turns);
	});

	it("carries Product Owner provider calls into pipeline evidence", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);

		const outcome = await harness.run({}, (dependencies) => ({
			...dependencies,
			createProductOwner: () => ({
				ask: () => Promise.resolve("Use the small scope"),
				snapshot: () => ({
					sessionId: "po-session",
					spentUsd: CONFIRMATION_METRIC.costUsd,
					providerCalls: [{ metrics: CONFIRMATION_METRIC }, {}],
				}),
			}),
		}));
		const [recordFile] = outcome.repRecordFiles;
		const record = parseConfirmationRepRecord(
			await Bun.file(recordFile ?? "missing").text(),
		);

		expect(record.metrics).toEqual({
			status: "MISSING",
			calls: [
				{ role: "worker", metrics: CONFIRMATION_METRIC },
				{ role: "worker", metrics: CONFIRMATION_METRIC },
				{ role: "product-owner", metrics: CONFIRMATION_METRIC },
				{ role: "stage-judge", metrics: CONFIRMATION_METRIC },
				{ role: "stage-judge", metrics: CONFIRMATION_METRIC },
				{ role: "final-judge", metrics: CONFIRMATION_METRIC },
			],
			missing: ["product-owner call metrics"],
		});
	});

	it("marks a later stage Judge invocation failure as a missing provider call", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);

		const outcome = await harness.run(
			{
				groupId: "stage-judge-metrics",
				reps: 2,
				projectedCost: {
					reps: 2,
					perRepMaximumUsd: 45,
					totalMaximumUsd: 90,
				},
			},
			(dependencies) => {
				const { stageSession, runStageJudge } = dependencies;
				const { runWorkflowStage } = stageSession;

				return {
					...dependencies,
					stageSession: {
						...stageSession,
						runWorkflowStage: async (request) => ({
							...(await runWorkflowStage(request)),
							sessionId: request.targetDir,
						}),
					},
					runStageJudge: (model, effort, budget, input, source) => {
						if (
							input.stage === "build" &&
							repOrdinal(input.transcript.sessionId) === 1
						) {
							return Promise.reject(
								new JudgeExecutionError({
									cause: new Error("stage Judge invocation failed"),
									prompt: "prompt",
									attempts: [
										{
											payload: { invalid: true },
											costUsd: CONFIRMATION_METRIC.costUsd,
											metrics: CONFIRMATION_METRIC,
											outcome: "REJECTED",
											error: "invalid output",
										},
									],
									costUsd: CONFIRMATION_METRIC.costUsd,
								}),
							);
						}

						return runStageJudge(model, effort, budget, input, source);
					},
				};
			},
		);
		const records = await Promise.all(
			outcome.repRecordFiles.map(async (path) =>
				parseConfirmationRepRecord(await Bun.file(path).text()),
			),
		);
		const report = z
			.object({
				reliability: z.array(
					z.object({
						name: z.string(),
						successful: z.number(),
						gradeDistribution: z.record(z.string(), z.number()),
					}),
				),
				resources: z.object({
					completeReps: z.number(),
					missingMetricReps: z.number(),
					total: z.object({ costUsd: z.array(z.number()) }),
				}),
			})
			.parse(JSON.parse(await Bun.file(outcome.reportFile).text()));
		const [failed] = records;
		testResources.track(dirname(failed?.worktreePath ?? "missing"));
		await removeWorktree(harness.sourceRoot, failed?.worktreePath ?? "missing");

		expect(failed?.stages[1]).toMatchObject({
			status: "EXECUTION_FAILED",
			error: "stage Judge invocation failed",
		});
		expect(failed?.metrics).toEqual({
			status: "MISSING",
			calls: [
				{ role: "worker", metrics: CONFIRMATION_METRIC },
				{ role: "worker", metrics: CONFIRMATION_METRIC },
				{ role: "stage-judge", metrics: CONFIRMATION_METRIC },
				{ role: "stage-judge", metrics: CONFIRMATION_METRIC },
			],
			missing: ["stage-judge call metrics"],
		});
		expect(report.reliability).toEqual([
			{
				name: "discuss",
				successful: 1,
				gradeDistribution: Object.fromEntries([["A", 2]]),
			},
			{
				name: "build",
				successful: 1,
				gradeDistribution: Object.fromEntries([["A", 1]]),
			},
			{ name: "final", successful: 1, gradeDistribution: { PASS: 1 } },
		]);
		expect(report.resources).toEqual({
			completeReps: 1,
			missingMetricReps: 1,
			total: { costUsd: [1.25] },
		});
	});

	it("attributes worktree creation failures without preserving an uncreated worktree", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);
		const started: number[] = [];

		const outcome = await harness.run({}, (dependencies) => ({
			...dependencies,
			addWorktree: (targetRoot, targetSha, worktreePath) => {
				if (worktreePath.endsWith("-rep-1")) {
					return Promise.reject(new Error("synthetic worktree collision"));
				}

				return dependencies.addWorktree(targetRoot, targetSha, worktreePath);
			},
			stageSession: {
				...dependencies.stageSession,
				runWorkflowStage: (request) => {
					if (request.stage === "discuss") {
						started.push(repOrdinal(request.targetDir));
					}

					return dependencies.stageSession.runWorkflowStage(request);
				},
			},
		}));
		const records = await Promise.all(
			outcome.repRecordFiles.map(async (path) =>
				parseConfirmationRepRecord(await Bun.file(path).text()),
			),
		);
		const [failed] = records;

		expect(failed?.stages[0]).toMatchObject({
			status: "EXECUTION_FAILED",
			error: "worktree creation failed: synthetic worktree collision",
		});
		expect(started.toSorted((left, right) => left - right)).toEqual([2, 3]);
		expect(harness.logs).not.toContain(
			`Pipeline rep ${failed?.repId} failed; evidence preserved at ${failed?.worktreePath}`,
		);
		expect(
			await stat(dirname(failed?.worktreePath ?? "missing")).then(
				() => true,
				() => false,
			),
		).toBe(false);
	});

	it("attributes checkpoint materialization failures and preserves the worktree", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);

		const outcome = await harness.run({}, (dependencies) => ({
			...dependencies,
			materializeCheckpoint: (checkpointDirectory, worktreePath) => {
				if (worktreePath.endsWith("-rep-1")) {
					return Promise.reject(new Error("synthetic checkpoint rejection"));
				}

				return dependencies.materializeCheckpoint(
					checkpointDirectory,
					worktreePath,
				);
			},
		}));
		const records = await Promise.all(
			outcome.repRecordFiles.map(async (path) =>
				parseConfirmationRepRecord(await Bun.file(path).text()),
			),
		);
		const [failed] = records;
		const preservedPath = failed?.worktreePath ?? "missing";
		testResources.track(dirname(preservedPath));

		expect(failed?.stages[0]).toMatchObject({
			status: "EXECUTION_FAILED",
			error:
				"checkpoint materialization failed: synthetic checkpoint rejection",
		});
		expect(harness.logs).toContain(
			`Pipeline rep ${failed?.repId} failed; evidence preserved at ${preservedPath}`,
		);
		expect(harness.removed).not.toContain(preservedPath);
		const preserved = await stat(preservedPath);

		expect(preserved.isDirectory()).toBe(true);
		await removeWorktree(harness.sourceRoot, preservedPath);
	});

	it("attributes corpus installation failures before each stage and preserves prior evidence", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);

		const outcome = await harness.run({}, (dependencies) => ({
			...dependencies,
			installStageCorpusSnapshot: (snapshotDirectory, worktreePath) => {
				const ordinal = repOrdinal(worktreePath);
				const stage = basename(snapshotDirectory);
				if (ordinal === 1 && stage === "discuss") {
					return Promise.reject(
						new Error("synthetic discuss corpus rejection"),
					);
				}
				if (ordinal === 2 && stage === "build") {
					return Promise.reject(new Error("synthetic build corpus rejection"));
				}

				return dependencies.installStageCorpusSnapshot(
					snapshotDirectory,
					worktreePath,
				);
			},
		}));
		const records = await Promise.all(
			outcome.repRecordFiles.map(async (path) =>
				parseConfirmationRepRecord(await Bun.file(path).text()),
			),
		);
		const [firstStageFailure, laterStageFailure] = records;
		const firstPreservedPath = firstStageFailure?.worktreePath ?? "missing";
		const laterPreservedPath = laterStageFailure?.worktreePath ?? "missing";
		testResources.track(dirname(firstPreservedPath));

		expect(firstStageFailure?.stages).toMatchObject([
			{
				stage: "discuss",
				status: "EXECUTION_FAILED",
				error: "corpus installation failed: synthetic discuss corpus rejection",
				worktreePath: firstPreservedPath,
			},
			{
				stage: "build",
				status: "NOT_REACHED",
				reason: "discuss execution failed",
			},
		]);
		expect(laterStageFailure?.stages).toMatchObject([
			{
				stage: "discuss",
				status: "JUDGED",
				grade: "A",
				verdict: "CONTINUE",
				evidence: {
					recordFile: "stages/discuss.json",
				},
			},
			{
				stage: "build",
				status: "EXECUTION_FAILED",
				error: "corpus installation failed: synthetic build corpus rejection",
				worktreePath: laterPreservedPath,
			},
		]);
		expect(
			records.slice(0, 2).map(({ finalOutcome }) => finalOutcome.status),
		).toEqual(["NOT_REACHED", "NOT_REACHED"]);
		expect(harness.logs).toContain(
			`Pipeline rep ${firstStageFailure?.repId} failed; evidence preserved at ${firstPreservedPath}`,
		);
		expect(harness.logs).toContain(
			`Pipeline rep ${laterStageFailure?.repId} failed; evidence preserved at ${laterPreservedPath}`,
		);
		expect(
			await Promise.all(
				[firstPreservedPath, laterPreservedPath].map((path) =>
					stat(path).then((entry) => entry.isDirectory()),
				),
			),
		).toEqual([true, true]);
		await Promise.all(
			[firstPreservedPath, laterPreservedPath].map((path) =>
				removeWorktree(harness.sourceRoot, path),
			),
		);
	});

	it("lets pipeline peers finish and preserves only a pre-evidence failure", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);
		const failed = Promise.withResolvers<boolean>();
		const finished: number[] = [];

		const outcome = await harness.run(
			{ groupId: "pipeline-failures" },
			(dependencies) => {
				const { stageSession } = dependencies;
				const { runWorkflowStage } = stageSession;

				return {
					...dependencies,
					stageSession: {
						...stageSession,
						runWorkflowStage: async (request) => {
							const ordinal = repOrdinal(request.targetDir);
							if (ordinal === 2) {
								failed.resolve(true);

								throw new Error("worker failed before evidence");
							}

							await failed.promise;
							if (request.stage === "discuss") {
								finished.push(ordinal);
							}
							const result = await runWorkflowStage(request);

							return {
								...result,
								sessionId: `${ordinal}-${request.stage}`,
							};
						},
					},
					runStageJudge: (_model, _effort, _budget, input, source) => {
						if (
							input.stage === "build" &&
							input.transcript.sessionId.startsWith("3-")
						) {
							return Promise.reject(
								new JudgeOutputValidationError({
									message: "Judge rejected both attempts",
									prompt: "prompt",
									attempts: [
										{
											payload: { invalid: true },
											costUsd: CONFIRMATION_METRIC.costUsd,
											metrics: CONFIRMATION_METRIC,
											outcome: "REJECTED",
											error: "invalid output",
										},
									],
									costUsd: CONFIRMATION_METRIC.costUsd,
								}),
							);
						}

						const scorecard = pipelineStageScorecard(input, source);
						const continues = input.transcript.sessionId.startsWith("3-");

						return Promise.resolve({
							...scorecard,
							grade: {
								...scorecard.grade,
								summary: continues ? "continue" : "stop",
								grade: continues ? "A" : "F",
								verdict: continues ? "CONTINUE" : "STOP",
							},
						});
					},
					runFinalJudge: () =>
						Promise.reject(new Error("final Judge is not reached")),
				};
			},
		);
		const records = await Promise.all(
			outcome.repRecordFiles.map(async (path) =>
				parseConfirmationRepRecord(await Bun.file(path).text()),
			),
		);

		expect(finished.toSorted((left, right) => left - right)).toEqual([1, 3]);
		expect(
			records.map(({ stages }) => stages.map(({ status }) => status)),
		).toEqual([
			["JUDGED", "NOT_REACHED"],
			["EXECUTION_FAILED", "NOT_REACHED"],
			["JUDGED", "EXECUTION_FAILED"],
		]);
		expect(records[1]?.stages[0]).toMatchObject({
			error: "worker failed before evidence",
		});
		expect(records[2]?.stages[1]).toMatchObject({
			error: "Judge rejected both attempts",
		});
		expect(
			records.every(({ outcome: result }) => result === "UNSUCCESSFUL"),
		).toBe(true);
		const preservedPath = records[1]?.worktreePath ?? "missing";
		testResources.track(dirname(preservedPath));
		expect(harness.logs).toContain(
			`Pipeline rep pipeline-failures-rep-2 failed; evidence preserved at ${preservedPath}`,
		);
		const preserved = await stat(preservedPath);
		expect(preserved.isDirectory()).toBe(true);
		expect(harness.removed).not.toContain(preservedPath);
		expect(harness.removed).toContain(records[2]?.worktreePath ?? "missing");
		expect(records[0]?.metrics.status).toBe("COMPLETE");
		expect(
			harness.retained.has("pipeline-failures/pipeline-failures-rep-1"),
		).toBe(true);
		expect(
			harness.retained.has("pipeline-failures/pipeline-failures-rep-3"),
		).toBe(true);
		const report = z
			.object({
				reliability: z.array(
					z.object({ name: z.string(), successful: z.number() }),
				),
			})
			.parse(JSON.parse(await Bun.file(outcome.reportFile).text()));
		expect(report.reliability[0]).toMatchObject({
			name: "discuss",
			successful: 1,
		});
		await removeWorktree(harness.sourceRoot, preservedPath);
	});

	it("removes its worktrees directory when the confirmation body throws", async () => {
		const harness = await PipelineConfirmationHarness.setup(testResources);
		let worktreesDirectory: string | undefined;
		const execution = harness.run(
			{ groupId: "pipeline-setup-failure" },
			(dependencies) => ({
				...dependencies,
				runSetup: (worktreePath) => {
					worktreesDirectory = dirname(worktreePath);
					throw new Error("setup unavailable");
				},
			}),
		);

		expect(execution).rejects.toThrow("setup unavailable");
		expect(worktreesDirectory).toBeDefined();
		expect(stat(worktreesDirectory ?? "")).rejects.toThrow();
	});
});

function repOrdinal(targetDirectory: string): number {
	const match = /-rep-(?<ordinal>\d+)$/u.exec(targetDirectory);

	return Number(match?.groups?.["ordinal"]);
}

async function repositoryState(directory: string): Promise<{
	readonly head: string;
	readonly branch: string;
	readonly status: string;
	readonly base: Uint8Array;
}> {
	return {
		head: await runCommand(["git", "rev-parse", "HEAD"], directory),
		branch: await runCommand(["git", "branch", "--show-current"], directory),
		status: await runCommand(["git", "status", "--porcelain"], directory),
		base: await Bun.file(join(directory, "base.txt")).bytes(),
	};
}
