import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { projectSlug } from "./session-capture";
import { join, relative } from "node:path";
import { z } from "zod";
import { SymlinkedEntryError } from "./file-presence";
import {
	captureStageCorpus,
	parseCheckpointRecord,
	resolveSkillDirectory,
	recordCheckpoint,
} from "./checkpoint";
import { runChecks } from "./checks";
import { CommandError, runCommand } from "./command";
import { parseArgs } from "./config";
import type {
	CalibrationResult,
	GradedRunArtifact,
	JudgeGrade,
	LocalCheckResult,
	StageJudgeInput,
	StageJudgeOutput,
	StageRubric,
	StageScorecard,
} from "./contracts";
import { StageValidationError } from "./contracts";
import type { CorpusMeasurement } from "./corpus-measurement";
import { RefusedPreconditionError } from "./exit-codes";
import { failureOf } from "#cli/cli-test-support";
import type {
	JudgeAgreementCalibration,
	JudgeAgreementReport,
} from "./judge-agreement";
import type { JudgeAttempt } from "./judge-attempt";
import { JudgeOutputValidationError } from "./judge-attempt";
import type { PipelineDefinition, PlanningStageDefinition } from "./pipeline";
import { loadPipeline } from "./pipeline";
import type {
	FinishGradedRunDependencies,
	FinishGradedRunRequest,
	RunArtifactBaseInputs,
	RunArtifactInputs,
	StageContext,
	StageDependencies,
} from "./run";
import {
	buildFailedJudgeRunArtifact,
	finishGradedRun,
	pauseForFailureInspection,
	pausesOnFailure,
	buildRunManifest,
	buildRunArtifact,
	captureRunBaseline,
	completeRunArtifact,
	ordinaryInitialCheckpointInputs,
	retainedCheckpointRecorder,
	judgeRun,
	runFinalJudge,
	runGradedStages,
} from "./run";
import {
	commitAll,
	PROJECT_ROOT,
	TEST_TARGET,
	TestResources,
	harnessResult,
	AUDIT_LOG_PIPELINE_PATH,
	AUDIT_LOG_RUBRICS_PATH,
} from "./test-support";
import type { PendingStage, RunArtifactPersistence } from "./run-abort";
import { createRunAbort, fileRunArtifactPersistence } from "./run-abort";
import type { RunEventKind } from "./run-events";
import {
	assertStageGradePassed,
	deriveStageGrade,
	parseStageRubric,
	StageQualityError,
} from "./stage-grading";
import type { WorkflowStageRequest } from "./workflow";

const testResources = TestResources.forEachTest();

function stageScorecard(
	requirementStatus: "PASS" | "FAIL",
	requirementId = "scope",
): StageScorecard {
	const rubric = parseStageRubric(
		JSON.stringify({
			stage: "discuss",
			hardBlockers: [
				{
					id: "invalid-stage-delivery",
					description: "Valid delivery",
				},
				{ id: "contradiction", description: "No conflict" },
			],
			requirements: [{ id: requirementId, description: "Scope is explicit" }],
			dimensions: [
				{
					id: "clarity",
					description: "Clear output",
					good: "Concrete",
					excellent: "Precise",
				},
			],
		}),
	);

	return {
		stage: "discuss",
		rubricPath: "rubrics/discuss.json",
		rubric,
		input: {
			stage: "discuss",
			kind: "planning",
			task: "Task",
			productBrief: "Brief",
			instructions: "Instructions",
			baselineContext: [],
			taskState: "State",
			transcript: {
				stage: "discuss",
				sessionId: "session",
				costUsd: 1,
				providerCalls: [],
				exchanges: [],
			},
			priorArtifacts: [],
		},
		prompt: "prompt",
		attempts: [],
		costUsd: 1,
		grade: deriveStageGrade(
			{
				...stageJudgeOutput("PASS", requirementStatus, "B"),
				requirements: [
					{
						id: requirementId,
						status: requirementStatus,
						evidence: [stageEvidence("artifact", "backlog/docs/spec.md")],
					},
				],
			},
			rubric,
		),
	};
}

function stageJudgeOutput(
	blocker: "PASS" | "FAIL",
	requirementStatus: "PASS" | "FAIL",
	dimensionGrade: "A" | "B" | "C" | "D" | "F",
): StageJudgeOutput {
	return {
		hardBlockers: [
			{
				id: "invalid-stage-delivery",
				status: "PASS",
				evidence: [stageEvidence("task", "backlog-seed.md")],
			},
			{
				id: "contradiction",
				status: blocker,
				evidence: [stageEvidence("artifact", "backlog/docs/spec.md")],
			},
		],
		requirements: [
			{
				id: "scope",
				status: requirementStatus,
				evidence: [stageEvidence("artifact", "backlog/docs/spec.md")],
			},
		],
		dimensions: [
			{
				id: "clarity",
				grade: dimensionGrade,
				evidence: [stageEvidence("artifact", "backlog/docs/spec.md")],
			},
		],
		summary: "stage grade",
	};
}

function loadDefaultPipeline(): Promise<PipelineDefinition> {
	return loadPipeline(AUDIT_LOG_PIPELINE_PATH, AUDIT_LOG_RUBRICS_PATH);
}

class ControlledRunArtifactPersistence implements RunArtifactPersistence {
	public readonly files = new Map<string, string>();
	public readonly writes: string[] = [];
	public activeWrites = 0;
	public maxActiveWrites = 0;
	private nextFailure: Error | undefined;
	private nextWrite:
		| {
				readonly started: PromiseWithResolvers<undefined>;
				readonly released: PromiseWithResolvers<undefined>;
		  }
		| undefined;

	public blockNextWrite(): BlockedRunArtifactWrite {
		const started = Promise.withResolvers<undefined>();
		const released = Promise.withResolvers<undefined>();
		this.nextWrite = { started, released };

		return {
			started: started.promise,
			release: () => {
				released.resolve(undefined);
			},
		};
	}

	public failNextWrite(): Error {
		const failure = new Error("persistence failed");
		this.nextFailure = failure;

		return failure;
	}

	public async write(path: string, contents: string): Promise<void> {
		this.writes.push(contents);
		const blocked = this.nextWrite;
		this.nextWrite = undefined;
		const failure = this.nextFailure;
		this.nextFailure = undefined;
		this.activeWrites += 1;
		this.maxActiveWrites = Math.max(this.maxActiveWrites, this.activeWrites);

		try {
			if (blocked !== undefined) {
				blocked.started.resolve(undefined);
				await blocked.released.promise;
			}
			if (failure !== undefined) {
				throw failure;
			}

			this.files.set(path, contents);
		} finally {
			this.activeWrites -= 1;
		}
	}

	public reset(): void {
		this.files.clear();
		this.writes.length = 0;
		this.activeWrites = 0;
		this.maxActiveWrites = 0;
		this.nextFailure = undefined;
		this.nextWrite = undefined;
	}
}

function artifactBaseInputs(
	pipeline: PipelineDefinition,
	pipelinePath: string,
): RunArtifactBaseInputs {
	return {
		timestamp: "2026-08-30T00:00:00.000Z",
		controlSha: "control-sha",
		source: { root: "/tmp/target", origin: undefined, sha: "source-sha" },
		taskSha: "task-sha",
		config: {
			caseId: "audit-log",
			sourceDir: "/tmp/target",
			model: "sonnet",
			judgeModel: "sonnet",
			sessionBudgetUsd: 5,
			pipelinePath,
			pause: false,
		},
		pipeline,
		claudeVersion: "claude 1.0.0",
		task: "Task",
		productBrief: "Brief",
		instructions: "Instructions",
		rubric: "Rubric",
		rubricIds: ["scope"],
		baselineContext: [],
		taskId: "TASK-1",
		productOwner: { sessionId: "po", spentUsd: 0, providerCalls: [] },
		workflow: [],
		stageScorecards: [],
		checkpoints: [],
		evidence: {
			resultSha: "result-sha",
			diff: "the-diff",
			changedPaths: ["src/example.ts"],
			taskState: "state",
			checkIntegrity: harnessResult("PASS", "checks match"),
			localChecks: harnessResult("PASS", "all green"),
		},
	};
}

const RUBRIC_IDS = [
	"tests",
	"worker",
	"check-integrity",
	"local-checks",
] as const;

function requirement(
	id: string,
	status: "PASS" | "FAIL",
): JudgeGrade["requirements"][number] {
	return {
		id,
		status,
		evidence: [
			{
				source: "diff",
				path: "src/audit/example.ts",
				claim: `${id} evidence`,
			},
		],
	};
}

function withFirstRequirement(
	grade: JudgeGrade,
	first: JudgeGrade["requirements"][number],
): JudgeGrade {
	return { ...grade, requirements: [first, ...grade.requirements.slice(1)] };
}

function completeGrade(verdict: "PASS" | "FAIL"): JudgeGrade {
	return {
		requirements: RUBRIC_IDS.map((id) => requirement(id, verdict)),
		verdict,
		summary: "complete",
	};
}

function artifactInputs(
	pipeline: PipelineDefinition,
	pipelinePath: string,
): RunArtifactInputs {
	return {
		...artifactBaseInputs(pipeline, pipelinePath),
		judge: {
			prompt: "judge prompt",
			attempts: [],
			costUsd: 0,
			grade: {
				requirements: [],
				verdict: "PASS" as const,
				summary: "ok",
			},
		},
		reviewFile: "/tmp/review.json",
	};
}

function stageEvidence(
	source: StageJudgeOutput["requirements"][number]["evidence"][number]["source"],
	path: string,
): StageJudgeOutput["requirements"][number]["evidence"][number] {
	return { source, path, claim: "evidence" };
}

interface BlockedRunArtifactWrite {
	readonly started: Promise<undefined>;
	readonly release: () => void;
}

describe(assertStageGradePassed.name, () => {
	it("stops the workflow on a failed stage grade", () => {
		expect(() => {
			assertStageGradePassed(stageScorecard("FAIL"));
		}).toThrow("minimum grade is B");
	});

	it("continues past a passing stage grade", () => {
		expect(() => {
			assertStageGradePassed(stageScorecard("PASS"));
		}).not.toThrow();
	});

	it("continues past a grade the caller's lowered minimum accepts", () => {
		expect(() => {
			assertStageGradePassed(stageScorecard("FAIL"), "C");
		}).not.toThrow();
	});

	it("names the caller's minimum when the grade falls below it", () => {
		expect(() => {
			assertStageGradePassed(stageScorecard("FAIL"), "C");
		}).not.toThrow();
		expect(() => {
			assertStageGradePassed(stageScorecard("FAIL"), "A");
		}).toThrow("minimum grade is A");
	});
});

describe(ordinaryInitialCheckpointInputs.name, () => {
	it("writes settings evidence that the production parser accepts", async () => {
		const targetDir = await mkdtemp(join(tmpdir(), "rehearse-initial-run-"));
		testResources.track(targetDir);
		const checkpointDirectory = join(targetDir, "checkpoint");
		await mkdir(join(targetDir, "backlog"), { recursive: true });
		await Bun.write(join(targetDir, "backlog", "config.yml"), "statuses: []\n");
		const loadedSettings = {
			json: '{"disableAllHooks":true}',
			hashed: { path: "stage-settings.json", sha256: "b".repeat(64) },
		};
		const inputs = ordinaryInitialCheckpointInputs(
			{
				taskSha: "task-sha",
				task: "Task",
				productBrief: "Brief",
				workflowFiles: [],
			},
			"sonnet",
			"high",
			loadedSettings,
		);

		await recordCheckpoint(targetDir, checkpointDirectory, inputs);
		const parsed = parseCheckpointRecord(
			await Bun.file(join(checkpointDirectory, "checkpoint.json")).text(),
		);

		expect(parsed.settingsFile).toEqual(loadedSettings.hashed);
	});
});

describe(runGradedStages.name, () => {
	interface StageHarness {
		readonly scorecardFor: (
			input: StageJudgeInput,
			verdict: "CONTINUE" | "STOP",
		) => StageScorecard;
		readonly dependencies: StageDependencies;
		readonly judged: StageJudgeInput[];
		readonly executed: string[];
		readonly rubricsUsed: string[];
		readonly settingsOverlays: (string | undefined)[];
	}

	function fakeStageDependencies(): StageHarness {
		const judged: StageJudgeInput[] = [];
		const executed: string[] = [];
		const rubricsUsed: string[] = [];
		const settingsOverlays: (string | undefined)[] = [];
		const scorecardFor = (
			input: StageJudgeInput,
			verdict: "CONTINUE" | "STOP",
		): StageScorecard => ({
			stage: input.stage,
			rubricPath: `${input.stage}.json`,
			rubric: parseStageRubric(
				JSON.stringify({
					stage: input.stage,
					hardBlockers: [
						{ id: "invalid-stage-delivery", description: "Valid delivery" },
						{ id: "false-test-safety", description: "Checks intact" },
						{ id: "unfinished-delivery", description: "Checks pass" },
					],
					requirements: [{ id: "scope", description: "Scope is explicit" }],
					dimensions: [
						{
							id: "clarity",
							description: "Clear output",
							good: "Concrete",
							excellent: "Precise",
						},
					],
				}),
				input.kind,
			),
			input,
			prompt: "prompt",
			attempts: [],
			costUsd: 0,
			grade: {
				...stageJudgeOutput("PASS", "PASS", verdict === "CONTINUE" ? "B" : "F"),
				grade: verdict === "CONTINUE" ? "B" : "F",
				verdict,
			},
		});

		return {
			scorecardFor,
			judged,
			executed,
			rubricsUsed,
			settingsOverlays,
			dependencies: {
				runWorkflowStage: ({ stage, skill, settingsOverlay }) => {
					executed.push(skill);
					settingsOverlays.push(settingsOverlay);

					return Promise.resolve({
						stage,
						sessionId: "session",
						costUsd: 0,
						providerCalls: [],
						exchanges: [],
					});
				},
				runStageJudge: (
					_model: string,
					_effort: undefined | "low" | "medium" | "high" | "xhigh" | "max",
					_budget: number,
					input: StageJudgeInput,
					source: { readonly rubricPath: string },
				) => {
					judged.push(input);
					rubricsUsed.push(source.rubricPath);

					return Promise.resolve(scorecardFor(input, "CONTINUE"));
				},
				readTaskOutput: () =>
					Promise.resolve(
						JSON.stringify({
							task: { acceptanceCriteria: ["done"], documentation: [] },
						}),
					),
				readTaskCard: () => Promise.resolve("the task card"),
				captureBuildCandidate: () =>
					Promise.resolve({
						resultSha: "candidate-sha",
						diff: "candidate-diff",
						changedPaths: ["src/example.ts"],
					}),
				assertPlanningStageCompleted: (
					_targetDir: string,
					baselineSha: string,
					stage: { readonly name: string },
				) =>
					Promise.resolve({
						taskState: `${stage.name}-state`,
						artifact: {
							path: `backlog/docs/${stage.name}.md`,
							content: `${stage.name} artifact`,
						},
						resultSha: baselineSha,
						diff: "",
						changedPaths: [],
					}),
				assertBuildCommitted: () =>
					Promise.resolve({
						resultSha: "result-sha",
						diff: "the-diff",
						commitSubjects: ["build commit"],
					}),
				changedPathsBetween: () => Promise.resolve(["src/example.ts"]),
				captureCheckIntegrity: () =>
					Promise.resolve(harnessResult("PASS", "checks match")),
				captureTreatmentChecks: () =>
					Promise.resolve(harnessResult("PASS", "all green")),
				resolveSkillDirectory: (skill: string) =>
					Promise.resolve(`/skills/${skill}`),
				captureStageCorpus: (skill: string) =>
					Promise.resolve([
						{
							path: `skills/${skill}/SKILL.md`,
							sha256: createHash("sha256").update(skill).digest("hex"),
						},
					]),
				measureCorpus: () =>
					Promise.resolve({ kind: "version", digest: "c".repeat(64) }),
				recordCheckpoint,
			},
		};
	}

	async function stageContext(): Promise<StageContext> {
		const stageDirectory = await mkdtemp(join(tmpdir(), "rehearse-stages-"));
		testResources.track(stageDirectory);
		const transitions = createRunAbort(
			{
				killActiveCommands: () => Promise.resolve(),
				registerSignal: () => undefined,
				releaseSignal: () => undefined,
				exit: () => undefined,
				reportError: () => undefined,
				persistence: fileRunArtifactPersistence,
			},
			{
				artifactFile: join(stageDirectory, "run.json"),
				teardown: () => Promise.resolve(),
			},
		);

		return {
			targetDir: stageDirectory,
			corpusSource: { kind: "directory", root: stageDirectory },
			initialLineage: "initial-lineage",
			model: "sonnet",
			judgeModel: "sonnet",
			sessionBudgetUsd: 5,
			productOwner: {
				ask: () => Promise.reject(new Error("no product owner in this test")),
				snapshot: () => ({
					sessionId: "po",
					spentUsd: 0,
					providerCalls: [],
				}),
			},
			task: "Task",
			productBrief: "Brief",
			instructions: "Instructions",
			baselineContext: [],
			baselineHashes: new Map<string, string>(),
			taskId: "TASK-1",
			taskSha: "task-sha",
			pipeline: await loadDefaultPipeline(),
			loadedSettings: {
				json: "{}",
				hashed: {
					path: "stage-settings.json",
					sha256: "a".repeat(64),
				},
			},
			stageFile: (stage: string) => join(stageDirectory, `${stage}.json`),
			checkpointDirectory: (stage: string) =>
				join(stageDirectory, "checkpoints", stage),
			writePendingStage: transitions.writePendingStage,
			updatePendingStage: transitions.updatePendingStage,
			writeStageProgress: transitions.writeStageProgress,
			completeStage: transitions.completeStage,
			calibrateStageFailure: (): Promise<CalibrationResult> =>
				Promise.reject(new Error("calibration not expected")),
			collectJudgeAgreement: () =>
				Promise.resolve({ skippedCalibrations: 0, baselines: [] }),
		};
	}

	it("preserves each stage's raw transcript into its checkpoint", async () => {
		const { dependencies } = fakeStageDependencies();
		const context = await stageContext();
		// The fake stage reports sessionId "session"; seed the transcript the
		// provider would have written for it, under the target's own slug.
		const projectsDirectory = await mkdtemp(
			join(tmpdir(), "rehearse-projects-"),
		);
		testResources.track(projectsDirectory);
		const slug = join(projectsDirectory, projectSlug(context.targetDir));
		await mkdir(slug, { recursive: true });
		const raw = `{"type":"user"}\n`;
		await Bun.write(join(slug, "session.jsonl"), raw);

		const outcome = await runGradedStages(dependencies, {
			...context,
			projectsDirectory,
		});

		const [first] = outcome.checkpoints;
		expect(first?.transcript).toEqual({
			file: "transcript.jsonl",
			sessionId: "session",
			status: "AVAILABLE",
		});
		expect(
			await Bun.file(
				join(context.checkpointDirectory("shape"), "transcript.jsonl"),
			).text(),
		).toBe(raw);
	});

	it("records in each stage's checkpoint the corpus version measured before its session ran", async () => {
		const { dependencies, executed } = fakeStageDependencies();
		const sessionsBeforeEachMeasurement: number[] = [];
		const measureCorpus = (): Promise<CorpusMeasurement> => {
			sessionsBeforeEachMeasurement.push(executed.length);

			return Promise.resolve({
				kind: "version",
				digest: String(executed.length).repeat(64),
			});
		};

		const outcome = await runGradedStages(
			{ ...dependencies, measureCorpus },
			await stageContext(),
		);

		expect(sessionsBeforeEachMeasurement).toEqual([0, 1]);
		expect(
			outcome.checkpoints.map(({ corpusVersion }) => corpusVersion),
		).toEqual([
			{ kind: "version", digest: "0".repeat(64) },
			{ kind: "version", digest: "1".repeat(64) },
		]);
	});

	it("records a refused corpus layout in the checkpoint and still runs the stage", async () => {
		const { dependencies, executed } = fakeStageDependencies();
		const refusal: CorpusMeasurement = {
			kind: "refused",
			refusal: "skills/escape.md resolves outside the tree",
		};

		const outcome = await runGradedStages(
			{ ...dependencies, measureCorpus: () => Promise.resolve(refusal) },
			await stageContext(),
		);

		expect(executed).toEqual(["shape", "build"]);
		expect(outcome.checkpoints[0]?.corpusVersion).toEqual(refusal);
	});

	it("records a stage whose provider wrote no transcript as unavailable", async () => {
		const { dependencies } = fakeStageDependencies();
		const context = await stageContext();
		const projectsDirectory = await mkdtemp(
			join(tmpdir(), "rehearse-projects-"),
		);
		testResources.track(projectsDirectory);

		const outcome = await runGradedStages(dependencies, {
			...context,
			projectsDirectory,
		});

		// No transcript was seeded. The checkpoint must say so rather than
		// leave a reader to treat the parsed exchanges as the raw record.
		expect(outcome.checkpoints[0]?.transcript).toEqual({
			sessionId: "session",
			status: "UNAVAILABLE",
		});
	});

	it("runs the stages in order and carries evidence forward", async () => {
		const { dependencies, judged, executed } = fakeStageDependencies();
		const context = await stageContext();

		const outcome = await runGradedStages(dependencies, context);

		expect(executed).toEqual(["shape", "build"]);
		expect(judged[1]?.priorArtifacts.map(({ path }) => path)).toEqual([
			"backlog/docs/shape.md",
		]);
		expect(judged[1]?.diff).toBe("the-diff");
		expect(judged[0]).not.toHaveProperty("commitSubjects");
		expect(judged[1]?.commitSubjects).toEqual(["build commit"]);
		expect(outcome.buildEvidence?.resultSha).toBe("result-sha");
		expect(outcome.workflow).toHaveLength(2);
	});

	it("records a stage-started run event for each stage before its session runs, so a monitor can name the stage in flight", async () => {
		const { dependencies, executed } = fakeStageDependencies();
		const executedCountAtEachStart: number[] = [];
		const recorded: {
			readonly kind: RunEventKind;
			readonly stage: string;
			readonly spentUsd: number;
			readonly elapsedMs: number;
		}[] = [];
		const context = {
			...(await stageContext()),
			runEvents: {
				record: (
					kind: RunEventKind,
					stage: string,
					spentUsd: number,
					elapsedMs: number,
				) => {
					recorded.push({ kind, stage, spentUsd, elapsedMs });
					if (kind === "stage-started") {
						executedCountAtEachStart.push(executed.length);
					}
				},
			},
			elapsedMs: () => 500,
		};

		await runGradedStages(dependencies, context);

		expect(recorded.filter(({ kind }) => kind === "stage-started")).toEqual([
			{ kind: "stage-started", stage: "shape", spentUsd: 0, elapsedMs: 500 },
			{ kind: "stage-started", stage: "build", spentUsd: 0, elapsedMs: 500 },
		]);
		expect(executedCountAtEachStart).toEqual([0, 1]);
	});

	it("records the stage session inputs beside a continued scorecard", async () => {
		const { dependencies } = fakeStageDependencies();
		const context = {
			...(await stageContext()),
			model: "opus",
			effort: "high" as const,
		};

		await runGradedStages(dependencies, context);

		const stageRecord = z
			.object({
				corpusFiles: z.array(
					z.object({ path: z.string(), sha256: z.string() }),
				),
				corpusVersion: z.object({ kind: z.string(), digest: z.string() }),
				model: z.string(),
				effort: z.string(),
			})
			.parse(JSON.parse(await Bun.file(context.stageFile("shape")).text()));
		expect(stageRecord).toEqual({
			corpusFiles: [
				{
					path: "skills/shape/SKILL.md",
					sha256: createHash("sha256").update("shape").digest("hex"),
				},
			],
			corpusVersion: { kind: "version", digest: "c".repeat(64) },
			model: "opus",
			effort: "high",
		});
	});

	it("records each stage's elapsed time on its stage record, from the run clock", async () => {
		const { dependencies, scorecardFor } = fakeStageDependencies();
		let runClockMs = 0;
		const timed = {
			...dependencies,
			runWorkflowStage: (request: WorkflowStageRequest) => {
				runClockMs += request.stage === "shape" ? 1000 : 3000;

				return dependencies.runWorkflowStage(request);
			},
			runStageJudge: (
				_model: string,
				_effort: undefined | "low" | "medium" | "high" | "xhigh" | "max",
				_budget: number,
				input: StageJudgeInput,
			) => {
				runClockMs += 200;

				return Promise.resolve(scorecardFor(input, "CONTINUE"));
			},
		};
		const context = {
			...(await stageContext()),
			elapsedMs: () => runClockMs,
		};

		await runGradedStages(timed, context);

		const elapsed = z.object({ elapsedMs: z.number() });
		expect(
			elapsed.parse(
				JSON.parse(await Bun.file(context.stageFile("shape")).text()),
			),
		).toEqual({ elapsedMs: 1200 });
		expect(
			elapsed.parse(
				JSON.parse(await Bun.file(context.stageFile("build")).text()),
			),
		).toEqual({ elapsedMs: 3200 });
	});

	it("persists stage records through the run transition boundary", async () => {
		const { dependencies } = fakeStageDependencies();
		const persistence = new ControlledRunArtifactPersistence();
		const abort = createRunAbort(
			{
				killActiveCommands: () => Promise.resolve(),
				registerSignal: () => undefined,
				releaseSignal: () => undefined,
				exit: () => undefined,
				reportError: () => undefined,
				persistence,
			},
			{
				artifactFile: "/runs/run.json",
				teardown: () => Promise.resolve(),
			},
		);
		const context = {
			...(await stageContext()),
			writePendingStage: abort.writePendingStage,
			completeStage: abort.completeStage,
		};

		await runGradedStages(dependencies, context);

		expect(
			JSON.parse(persistence.files.get(context.stageFile("shape")) ?? ""),
		).toMatchObject({
			model: "sonnet",
			grade: { verdict: "CONTINUE" },
		});
	});

	it("retains commit subjects in awaiting and completed stage records", async () => {
		const { dependencies, scorecardFor } = fakeStageDependencies();
		const context = await stageContext();
		let awaitingSubjects: readonly string[] | undefined;
		const recording = {
			...dependencies,
			runStageJudge: async (
				_model: string,
				_effort: undefined | "low" | "medium" | "high" | "xhigh" | "max",
				_budget: number,
				input: StageJudgeInput,
			) => {
				if (input.stage === "build") {
					const pendingRecord: unknown = JSON.parse(
						await Bun.file(context.stageFile(input.stage)).text(),
					);
					const pending = z
						.object({
							input: z.object({ commitSubjects: z.array(z.string()) }),
						})
						.parse(pendingRecord);
					awaitingSubjects = pending.input.commitSubjects;
				}

				return scorecardFor(input, "CONTINUE");
			},
		};

		await runGradedStages(recording, context);

		const completedRecord: unknown = JSON.parse(
			await Bun.file(context.stageFile("build")).text(),
		);
		const completed = z
			.object({ input: z.object({ commitSubjects: z.array(z.string()) }) })
			.parse(completedRecord);
		expect(awaitingSubjects).toEqual(["build commit"]);
		expect(completed.input.commitSubjects).toEqual(["build commit"]);
	});

	it("records Judge attempts beside a continued scorecard", async () => {
		const { dependencies, scorecardFor } = fakeStageDependencies();
		const attempts: readonly JudgeAttempt[] = [
			{
				payload: { summary: "accepted" },
				costUsd: 0.4,
				outcome: "ACCEPTED",
			},
		];
		const context = await stageContext();
		const recording = {
			...dependencies,
			runStageJudge: (
				_model: string,
				_effort: undefined | "low" | "medium" | "high" | "xhigh" | "max",
				_budget: number,
				input: StageJudgeInput,
			) =>
				Promise.resolve({
					...scorecardFor(input, "CONTINUE"),
					attempts,
					costUsd: 0.4,
				}),
		};

		await runGradedStages(recording, context);

		const record: unknown = JSON.parse(
			await Bun.file(context.stageFile("shape")).text(),
		);
		expect(record).toMatchObject({ attempts, costUsd: 0.4 });
	});

	it("retains exhausted validation evidence on the pending stage", async () => {
		const { dependencies } = fakeStageDependencies();
		const attempts: readonly JudgeAttempt[] = [
			{
				payload: { summary: "invalid" },
				costUsd: 0.1,
				outcome: "REJECTED",
				error: "invalid evidence",
			},
		];
		const failure = new JudgeOutputValidationError({
			message: "invalid evidence",
			prompt: "original prompt",
			attempts,
			costUsd: 0.1,
		});
		const pendingStages: (PendingStage | undefined)[] = [];
		const context = {
			...(await stageContext()),
			updatePendingStage: (pending: PendingStage) => {
				pendingStages.push(pending);
			},
		};
		const failing = {
			...dependencies,
			runStageJudge: () => Promise.reject(failure),
		};

		expect(runGradedStages(failing, context)).rejects.toBe(failure);

		expect(pendingStages.at(-1)?.failure).toEqual({
			prompt: "original prompt",
			attempts,
			costUsd: 0.1,
		});
	});

	it("retains the stopped scorecard on the pending stage for a normal grade failure", async () => {
		const { dependencies, scorecardFor } = fakeStageDependencies();
		const pendingStages: (PendingStage | undefined)[] = [];
		const context = {
			...(await stageContext()),
			updatePendingStage: (pending: PendingStage) => {
				pendingStages.push(pending);
			},
			calibrateStageFailure: (): Promise<CalibrationResult | undefined> =>
				Promise.resolve(undefined),
		};
		const failing = {
			...dependencies,
			runStageJudge: (
				_model: string,
				_effort: undefined | "low" | "medium" | "high" | "xhigh" | "max",
				_budget: number,
				input: StageJudgeInput,
			) => Promise.resolve(scorecardFor(input, "STOP")),
		};

		const outcome = runGradedStages(failing, context);

		expect(outcome).rejects.toThrow("minimum grade is B");
		await outcome.catch(() => undefined);
		expect(pendingStages.at(-1)?.scorecard?.grade.verdict).toBe("STOP");
	});

	it("keeps the judge's findings, captured corpus files and corpus version in the aborted stage artifact after a normal grade failure", async () => {
		const { dependencies, scorecardFor } = fakeStageDependencies();
		const persistence = new ControlledRunArtifactPersistence();
		const abort = createRunAbort(
			{
				killActiveCommands: () => Promise.resolve(),
				registerSignal: () => undefined,
				releaseSignal: () => undefined,
				exit: () => undefined,
				reportError: () => undefined,
				persistence,
			},
			{
				artifactFile: "/runs/run.json",
				teardown: () => Promise.resolve(),
			},
		);
		const context = {
			...(await stageContext()),
			writePendingStage: abort.writePendingStage,
			updatePendingStage: abort.updatePendingStage,
			writeStageProgress: abort.writeStageProgress,
			completeStage: abort.completeStage,
			calibrateStageFailure: (): Promise<CalibrationResult | undefined> =>
				Promise.resolve(undefined),
		};
		let stoppedScorecard: StageScorecard | undefined;
		const failing = {
			...dependencies,
			runStageJudge: (
				_model: string,
				_effort: undefined | "low" | "medium" | "high" | "xhigh" | "max",
				_budget: number,
				input: StageJudgeInput,
			) => {
				stoppedScorecard = scorecardFor(input, "STOP");

				return Promise.resolve(stoppedScorecard);
			},
		};

		const outcome = runGradedStages(failing, context);
		await outcome.catch(() => undefined);
		await abort.markAborted("shape stage graded F; minimum grade is B");

		const record: unknown = JSON.parse(
			persistence.files.get(context.stageFile("shape")) ?? "",
		);
		expect(record).toMatchObject({
			status: "STAGE_JUDGE_FAILED",
			hardBlockers: stoppedScorecard?.grade.hardBlockers,
			requirements: stoppedScorecard?.grade.requirements,
			dimensions: stoppedScorecard?.grade.dimensions,
			summary: stoppedScorecard?.grade.summary,
			corpusFiles: [
				{
					path: "skills/shape/SKILL.md",
					sha256: createHash("sha256").update("shape").digest("hex"),
				},
			],
			corpusVersion: { kind: "version", digest: "c".repeat(64) },
		});
	});

	it("keeps the stopped grade, minimum grade, judge attempts, elapsed times and Product Owner spend in the aborted stage artifact", async () => {
		const { dependencies, scorecardFor } = fakeStageDependencies();
		const persistence = new ControlledRunArtifactPersistence();
		const abort = createRunAbort(
			{
				killActiveCommands: () => Promise.resolve(),
				registerSignal: () => undefined,
				releaseSignal: () => undefined,
				exit: () => undefined,
				reportError: () => undefined,
				persistence,
			},
			{
				artifactFile: "/runs/run.json",
				teardown: () => Promise.resolve(),
			},
		);
		const judgeAttempts: readonly JudgeAttempt[] = [
			{
				payload: {},
				costUsd: 0.4,
				outcome: "ACCEPTED",
				metrics: {
					costUsd: 0.4,
					inputTokens: 10,
					outputTokens: 20,
					cacheReadTokens: 30,
					cacheWriteTokens: 40,
					turns: 1,
				},
			},
		];
		const productOwnerCalls = [
			{
				metrics: {
					costUsd: 0.75,
					inputTokens: 1,
					outputTokens: 2,
					cacheReadTokens: 3,
					cacheWriteTokens: 4,
					turns: 1,
				},
			},
		];
		let runClockMs = 5000;
		const context = {
			...(await stageContext()),
			minimumStageGrade: "C" as const,
			elapsedMs: () => runClockMs,
			productOwner: {
				ask: () => Promise.reject(new Error("no product owner in this test")),
				snapshot: () => ({
					sessionId: "po",
					spentUsd: 0.75,
					providerCalls: productOwnerCalls,
				}),
			},
			writePendingStage: abort.writePendingStage,
			updatePendingStage: abort.updatePendingStage,
			writeStageProgress: abort.writeStageProgress,
			completeStage: abort.completeStage,
			calibrateStageFailure: (): Promise<CalibrationResult | undefined> =>
				Promise.resolve(undefined),
		};
		const failing = {
			...dependencies,
			runStageJudge: (
				_model: string,
				_effort: undefined | "low" | "medium" | "high" | "xhigh" | "max",
				_budget: number,
				input: StageJudgeInput,
			) => {
				runClockMs += 2500;

				return Promise.resolve({
					...scorecardFor(input, "STOP"),
					attempts: judgeAttempts,
				});
			},
		};

		const stopped = runGradedStages(failing, context);
		expect(stopped).rejects.toBeInstanceOf(StageQualityError);
		await stopped.catch(() => undefined);
		await abort.markAborted("shape stage graded F; minimum grade is C");

		const record: unknown = JSON.parse(
			persistence.files.get(context.stageFile("shape")) ?? "",
		);
		expect(record).toMatchObject({
			status: "STAGE_JUDGE_FAILED",
			grade: { grade: "F", verdict: "STOP" },
			minimumGrade: "C",
			attempts: judgeAttempts,
			elapsedMs: 2500,
			runElapsedMs: 7500,
			productOwnerCostUsd: 0.75,
			productOwnerProviderCalls: productOwnerCalls,
		});
	});

	it("stops at a raised minimum grade with a stop record, though the judge's verdict is CONTINUE", async () => {
		const { dependencies, scorecardFor } = fakeStageDependencies();
		const persistence = new ControlledRunArtifactPersistence();
		const abort = createRunAbort(
			{
				killActiveCommands: () => Promise.resolve(),
				registerSignal: () => undefined,
				releaseSignal: () => undefined,
				exit: () => undefined,
				reportError: () => undefined,
				persistence,
			},
			{
				artifactFile: "/runs/run.json",
				teardown: () => Promise.resolve(),
			},
		);
		const context = {
			...(await stageContext()),
			minimumStageGrade: "A" as const,
			writePendingStage: abort.writePendingStage,
			updatePendingStage: abort.updatePendingStage,
			writeStageProgress: abort.writeStageProgress,
			completeStage: abort.completeStage,
			calibrateStageFailure: (): Promise<CalibrationResult | undefined> =>
				Promise.resolve(undefined),
		};
		const passingB = {
			...dependencies,
			runStageJudge: (
				_model: string,
				_effort: undefined | "low" | "medium" | "high" | "xhigh" | "max",
				_budget: number,
				input: StageJudgeInput,
			) => Promise.resolve(scorecardFor(input, "CONTINUE")),
		};

		const stopped = runGradedStages(passingB, context);
		expect(stopped).rejects.toBeInstanceOf(StageQualityError);
		await stopped.catch(() => undefined);
		await abort.markAborted("shape stage graded B; minimum grade is A");

		const record: unknown = JSON.parse(
			persistence.files.get(context.stageFile("shape")) ?? "",
		);
		expect(record).toMatchObject({
			status: "STAGE_JUDGE_FAILED",
			grade: { grade: "B", verdict: "CONTINUE" },
			minimumGrade: "A",
		});
	});

	it("records workflow model, judge model, effort settings, and budget in the aborted stage artifact when judgment fails", async () => {
		const { dependencies, scorecardFor } = fakeStageDependencies();
		const persistence = new ControlledRunArtifactPersistence();
		const abort = createRunAbort(
			{
				killActiveCommands: () => Promise.resolve(),
				registerSignal: () => undefined,
				releaseSignal: () => undefined,
				exit: () => undefined,
				reportError: () => undefined,
				persistence,
			},
			{
				artifactFile: "/runs/run.json",
				teardown: () => Promise.resolve(),
			},
		);
		const context = {
			...(await stageContext()),
			model: "claude-3-5-sonnet-20241022",
			effort: "high" as const,
			judgeModel: "claude-3-7-sonnet-20250219",
			judgeEffort: "low" as const,
			sessionBudgetUsd: 12,
			writePendingStage: abort.writePendingStage,
			updatePendingStage: abort.updatePendingStage,
			writeStageProgress: abort.writeStageProgress,
			completeStage: abort.completeStage,
			calibrateStageFailure: (): Promise<CalibrationResult | undefined> =>
				Promise.resolve(undefined),
		};
		const failing = {
			...dependencies,
			runStageJudge: (
				_model: string,
				_effort: undefined | "low" | "medium" | "high" | "xhigh" | "max",
				_budget: number,
				input: StageJudgeInput,
			) => Promise.resolve(scorecardFor(input, "STOP")),
		};

		const outcome = runGradedStages(failing, context);
		await outcome.catch(() => undefined);
		await abort.markAborted("shape stage graded F; minimum grade is B");

		const record: unknown = JSON.parse(
			persistence.files.get(context.stageFile("shape")) ?? "",
		);
		expect(record).toMatchObject({
			status: "STAGE_JUDGE_FAILED",
			model: "claude-3-5-sonnet-20241022",
			effort: "high",
			judgeModel: "claude-3-7-sonnet-20250219",
			judgeEffort: "low",
			sessionBudgetUsd: 12,
		});
	});

	function planningStage(
		name: string,
		artifact: string,
		rubric: string,
	): PlanningStageDefinition {
		return {
			name,
			kind: "planning" as const,
			skill: name,
			artifact,
			rubric,
			requiresAcceptanceCriteria: false,
		};
	}

	const deliveryStage = {
		name: "build",
		kind: "delivery" as const,
		skill: "build",
		rubric: `${AUDIT_LOG_RUBRICS_PATH}/build.json`,
	};

	it("runs the pipeline target checks after delivery validation", async () => {
		const { dependencies } = fakeStageDependencies();
		const events: string[] = [];
		const observedCommands: string[][] = [];
		const target = {
			checks: [{ command: ["bun", "run", "custom-check"] }],
			integrityFiles: ["custom-check.json"],
		};
		const context = {
			...(await stageContext()),
			pipeline: {
				statuses: ["To Do", "Done"],
				target,
				stages: [deliveryStage],
			},
		};
		const observing = {
			...dependencies,
			assertBuildCommitted: () => {
				events.push("delivery validated");

				return Promise.resolve({
					resultSha: "result-sha",
					diff: "the-diff",
					commitSubjects: ["build commit"],
				});
			},
			captureTreatmentChecks: (
				_targetDir: string,
				checks: readonly { readonly command: readonly string[] }[] = [],
			) => {
				events.push("checks run");
				observedCommands.push(...checks.map(({ command }) => [...command]));

				return Promise.resolve(harnessResult("PASS", "all green"));
			},
		};

		await runGradedStages(observing, context);

		expect(events).toEqual(["delivery validated", "checks run"]);
		expect(observedCommands).toEqual([["bun", "run", "custom-check"]]);
	});

	it("carries every earlier artifact through a multi-stage pipeline", async () => {
		const { dependencies, judged, executed } = fakeStageDependencies();
		const context = {
			...(await stageContext()),
			pipeline: {
				statuses: ["To Do", "Done"],
				target: TEST_TARGET,
				stages: [
					planningStage(
						"discuss",
						"spec",
						`${AUDIT_LOG_RUBRICS_PATH}/shape.json`,
					),
					planningStage(
						"grill",
						"grilled",
						`${AUDIT_LOG_RUBRICS_PATH}/shape.json`,
					),
					deliveryStage,
				],
			},
		};

		await runGradedStages(dependencies, context);

		expect(executed).toEqual(["discuss", "grill", "build"]);
		expect(judged[2]?.priorArtifacts.map(({ path }) => path)).toEqual([
			"backlog/docs/discuss.md",
			"backlog/docs/grill.md",
		]);
	});

	it("executes stages in their declared order, not a known one", async () => {
		const { dependencies, executed } = fakeStageDependencies();
		const context = {
			...(await stageContext()),
			pipeline: {
				statuses: ["To Do", "Done"],
				target: TEST_TARGET,
				stages: [
					planningStage(
						"discuss",
						"spec",
						`${AUDIT_LOG_RUBRICS_PATH}/shape.json`,
					),
					planningStage("plan", "plan", `${AUDIT_LOG_RUBRICS_PATH}/shape.json`),
					planningStage(
						"grill",
						"grilled",
						`${AUDIT_LOG_RUBRICS_PATH}/shape.json`,
					),
					deliveryStage,
				],
			},
		};

		await runGradedStages(dependencies, context);

		expect(executed).toEqual(["discuss", "plan", "grill", "build"]);
	});

	it("labels a transcript with the stage name, not the skill it ran", async () => {
		const { dependencies, executed } = fakeStageDependencies();
		const context = {
			...(await stageContext()),
			pipeline: {
				statuses: ["To Do", "Done"],
				target: TEST_TARGET,
				stages: [
					{
						name: "research",
						kind: "planning" as const,
						skill: "discuss",
						artifact: "findings",
						rubric: `${AUDIT_LOG_RUBRICS_PATH}/shape.json`,
						requiresAcceptanceCriteria: false,
					},
					deliveryStage,
				],
			},
		};

		const outcome = await runGradedStages(dependencies, context);

		expect(executed).toEqual(["discuss", "build"]);
		expect(outcome.workflow.map(({ stage }) => stage)).toEqual([
			"research",
			"build",
		]);
		expect(outcome.stageScorecards.map(({ stage }) => stage)).toEqual([
			"research",
			"build",
		]);
	});

	it("executes a fifth stage under a name the harness never knew", async () => {
		const { dependencies, judged, executed, rubricsUsed } =
			fakeStageDependencies();
		const context = {
			...(await stageContext()),
			pipeline: {
				statuses: ["To Do", "Done"],
				target: TEST_TARGET,
				stages: [
					planningStage(
						"discuss",
						"spec",
						`${AUDIT_LOG_RUBRICS_PATH}/shape.json`,
					),
					planningStage(
						"research",
						"findings",
						`${AUDIT_LOG_RUBRICS_PATH}/shape.json`,
					),
					planningStage("plan", "plan", `${AUDIT_LOG_RUBRICS_PATH}/shape.json`),
					deliveryStage,
				],
			},
		};

		await runGradedStages(dependencies, context);

		expect(executed).toEqual(["discuss", "research", "plan", "build"]);
		expect(judged[1]?.stage).toBe("research");
		expect(
			rubricsUsed[1]?.endsWith(`${AUDIT_LOG_RUBRICS_PATH}/shape.json`),
		).toBe(true);
	});

	it("carries a planning stage's commits into evidence and the baseline", async () => {
		const { dependencies, judged } = fakeStageDependencies();
		const buildBaselines: string[] = [];
		const committing = {
			...dependencies,
			assertPlanningStageCompleted: (
				_targetDir: string,
				_baselineSha: string,
				stage: { readonly name: string },
			) =>
				Promise.resolve({
					taskState: `${stage.name}-state`,
					artifact: {
						path: `backlog/docs/${stage.name}.md`,
						content: `${stage.name} artifact`,
					},
					resultSha: `${stage.name}-sha`,
					diff: "glossary-diff",
					changedPaths: ["GLOSSARY.md"],
					commitSubjects: [`${stage.name} commit`],
				}),
			assertBuildCommitted: (_targetDir: string, baselineSha: string) => {
				buildBaselines.push(baselineSha);

				return Promise.resolve({
					resultSha: "result-sha",
					diff: "the-diff",
					commitSubjects: ["build commit"],
				});
			},
		};

		const outcome = await runGradedStages(committing, await stageContext());

		expect(judged[0]?.taskState).toBe("the task card");
		expect(judged[0]?.diff).toBe("glossary-diff");
		expect(judged[0]?.changedPaths).toEqual(["GLOSSARY.md"]);
		expect(judged.map(({ commitSubjects }) => commitSubjects)).toEqual([
			["shape commit"],
			["build commit"],
		]);
		expect(buildBaselines).toEqual(["shape-sha"]);
		expect(outcome.checkpoints.map(({ targetSha }) => targetSha)).toEqual([
			"shape-sha",
			"result-sha",
		]);
	});

	it("withholds commit subjects when delivery validation fails", async () => {
		const { dependencies, judged } = fakeStageDependencies();
		const invalid = {
			...dependencies,
			assertBuildCommitted: () =>
				Promise.reject(
					new StageValidationError(
						"Build phase rewrote or discarded task history",
					),
				),
		};

		await runGradedStages(invalid, await stageContext());

		const [, buildInput] = judged;
		expect(buildInput?.harnessFailure).toBe(
			"Build phase rewrote or discarded task history",
		);
		expect(buildInput).not.toHaveProperty("commitSubjects");
	});

	it("writes a checkpoint for every accepted stage and chains lineage", async () => {
		const { dependencies } = fakeStageDependencies();
		const context = await stageContext();
		await mkdir(join(context.targetDir, "backlog"), { recursive: true });
		await Bun.write(
			join(context.targetDir, "backlog", "config.yml"),
			"statuses: []\n",
		);

		const outcome = await runGradedStages(dependencies, context);

		expect(outcome.checkpoints.map(({ stage }) => stage)).toEqual([
			"shape",
			"build",
		]);
		expect(outcome.checkpoints[0]?.upstream).toBe(context.initialLineage);
		expect(outcome.checkpoints[1]?.upstream).toBe(
			outcome.checkpoints[0]?.lineage,
		);
		expect(outcome.checkpoints[0]?.targetSha).toBe("task-sha");
		expect(outcome.checkpoints[1]?.targetSha).toBe("result-sha");
		expect(outcome.checkpoints[0]?.artifacts.map(({ path }) => path)).toEqual([
			"backlog/docs/shape.md",
		]);
		for (const record of outcome.checkpoints) {
			const written: unknown = JSON.parse(
				await Bun.file(
					join(context.checkpointDirectory(record.stage), "checkpoint.json"),
				).text(),
			);
			expect(written).toEqual(record);
		}
	});

	it("delivers one settings value to every stage and records its evidence", async () => {
		const { dependencies, settingsOverlays } = fakeStageDependencies();
		const settings = {
			json: '{"disableAllHooks":true}',
			hashed: { path: "stage-settings.json", sha256: "b".repeat(64) },
		};
		const context = {
			...(await stageContext()),
			loadedSettings: settings,
		};

		const outcome = await runGradedStages(dependencies, context);

		expect(settingsOverlays).toEqual([settings.json, settings.json]);
		expect(outcome.checkpoints.map(({ settingsFile }) => settingsFile)).toEqual(
			[settings.hashed, settings.hashed],
		);
		for (const checkpoint of outcome.checkpoints) {
			const written = await Bun.file(
				join(context.checkpointDirectory(checkpoint.stage), "checkpoint.json"),
			).text();
			expect(parseCheckpointRecord(written)).toEqual(checkpoint);
		}
	});

	it("keeps accepted checkpoints when a later stage is rejected", async () => {
		const { dependencies, scorecardFor } = fakeStageDependencies();
		const context = {
			...(await stageContext()),
			calibrateStageFailure: (): Promise<CalibrationResult> =>
				Promise.resolve({
					humanReview: { verdict: "REJECT", summary: "failed", findings: [] },
					instructionsChanged: false,
					rubricChanged: false,
					stageRubricsChanged: [],
				}),
		};
		const failing = {
			...dependencies,
			runStageJudge: (
				_model: string,
				_effort: undefined | "low" | "medium" | "high" | "xhigh" | "max",
				_budget: number,
				input: StageJudgeInput,
				_source: {
					readonly rubricPath: string;
					readonly content: string;
					readonly rubric: StageRubric;
				},
			) =>
				Promise.resolve(
					scorecardFor(input, input.stage === "build" ? "STOP" : "CONTINUE"),
				),
		};

		expect(runGradedStages(failing, context)).rejects.toThrow(
			"minimum grade is B",
		);

		expect(
			await Bun.file(
				join(context.checkpointDirectory("shape"), "checkpoint.json"),
			).exists(),
		).toBe(true);
		expect(
			await Bun.file(
				join(context.checkpointDirectory("build"), "checkpoint.json"),
			).exists(),
		).toBe(false);
	});

	it("fails before any stage runs when a skill's corpus is missing", async () => {
		const { dependencies, executed } = fakeStageDependencies();
		const missing = {
			...dependencies,
			resolveSkillDirectory: (skill: string) => {
				if (skill === "build") {
					return Promise.reject(
						new Error(`The ${skill} skill is not installed`),
					);
				}

				return Promise.resolve(`/skills/${skill}`);
			},
		};

		expect(runGradedStages(missing, await stageContext())).rejects.toThrow(
			"build skill is not installed",
		);
		expect(executed).toEqual([]);
	});

	it("fails before any stage runs when a stage's skill is missing", async () => {
		const { dependencies, executed } = fakeStageDependencies();
		const missing = {
			...dependencies,
			resolveSkillDirectory: (skill: string) => {
				if (skill === "build") {
					return Promise.reject(
						new Error(`The ${skill} skill is not installed`),
					);
				}

				return Promise.resolve(`/skills/${skill}`);
			},
		};

		expect(runGradedStages(missing, await stageContext())).rejects.toThrow(
			"build skill is not installed",
		);
		expect(executed).toEqual([]);
	});

	it("refuses a foreign layout before invoking the affected workflow", async () => {
		const { dependencies, executed } = fakeStageDependencies();
		const context = await stageContext();
		const root = join(context.targetDir, "corpus");
		await Bun.write(join(root, "skills", "shape", "SKILL.md"), "shape\n");
		await Bun.write(join(root, "skills", "build", "SKILL.md"), "build\n");
		const outside = join(context.targetDir, "foreign");
		await Bun.write(join(outside, "private.md"), "foreign bytes\n");
		await symlink(outside, join(root, "agents"));

		const failure = await failureOf(
			runGradedStages(
				{ ...dependencies, captureStageCorpus, resolveSkillDirectory },
				{ ...context, corpusSource: { kind: "directory", root } },
			),
		);

		expect(failure).toBeInstanceOf(SymlinkedEntryError);
		expect(executed).toEqual([]);
	});

	it("hashes a stage's corpus when the stage starts, not at run start", async () => {
		const { dependencies } = fakeStageDependencies();
		const log: string[] = [];
		const timed = {
			...dependencies,
			resolveSkillDirectory: (skill: string) => {
				log.push(`resolve:${skill}`);

				return Promise.resolve(`/skills/${skill}`);
			},
			captureStageCorpus: (
				...args: Readonly<Parameters<StageDependencies["captureStageCorpus"]>>
			) => {
				log.push(`corpus:${args[0]}`);

				return dependencies.captureStageCorpus(...args);
			},
			runWorkflowStage: (
				...args: Readonly<Parameters<(typeof dependencies)["runWorkflowStage"]>>
			) => {
				log.push(`run:${args[0].stage}`);

				return dependencies.runWorkflowStage(...args);
			},
		};

		await runGradedStages(timed, await stageContext());

		expect(log).toEqual([
			"resolve:shape",
			"resolve:build",
			"corpus:shape",
			"run:shape",
			"corpus:build",
			"run:build",
		]);
	});

	it("stops after a failing grade and calibrates the failed stage", async () => {
		const { dependencies, scorecardFor, judged, executed } =
			fakeStageDependencies();
		const context = await stageContext();
		let calibrations = 0;
		const failing = {
			...dependencies,
			runStageJudge: (
				_model: string,
				_effort: undefined | "low" | "medium" | "high" | "xhigh" | "max",
				_budget: number,
				input: StageJudgeInput,
				_source: {
					readonly rubricPath: string;
					readonly content: string;
					readonly rubric: StageRubric;
				},
			) => {
				judged.push(input);

				return Promise.resolve(
					scorecardFor(input, input.stage === "shape" ? "STOP" : "CONTINUE"),
				);
			},
		};
		const calibrating = {
			...context,
			calibrateStageFailure: (): Promise<CalibrationResult> => {
				calibrations += 1;

				return Promise.resolve({
					humanReview: {
						verdict: "REJECT",
						summary: "The shape stage failed.",
						findings: [],
					},
					instructionsChanged: false,
					rubricChanged: false,
					stageRubricsChanged: [],
				});
			},
		};

		const outcome = runGradedStages(failing, calibrating);

		expect(outcome).rejects.toThrow("minimum grade is B");
		expect(executed).toEqual(["shape"]);
		expect(calibrations).toBe(1);
		const stageRecord = z
			.looseObject({
				calibration: z.looseObject({
					humanReview: z.looseObject({ verdict: z.string() }),
				}),
			})
			.parse(JSON.parse(await Bun.file(calibrating.stageFile("shape")).text()));
		expect(stageRecord.calibration.humanReview.verdict).toBe("REJECT");
	});

	it("records the stopped stage's Judge agreement including its calibration", async () => {
		const { dependencies, scorecardFor } = fakeStageDependencies();
		const context = await stageContext();
		const calibration: CalibrationResult = {
			humanReview: {
				verdict: "REJECT",
				summary: "The shape stage failed.",
				findings: [],
			},
			instructionsChanged: false,
			rubricChanged: false,
			stageRubricsChanged: [],
		};
		const judgeAgreement: JudgeAgreementReport = {
			skippedCalibrations: 0,
			baselines: [],
		};
		let currentCalibrations: readonly JudgeAgreementCalibration[] = [];
		const calibrating = {
			...context,
			judgeModel: "opus",
			calibrateStageFailure: () => Promise.resolve(calibration),
			collectJudgeAgreement: (
				current: readonly JudgeAgreementCalibration[],
			) => {
				currentCalibrations = current;

				return Promise.resolve(judgeAgreement);
			},
		};
		const failing = {
			...dependencies,
			runStageJudge: (
				_model: string,
				_effort: undefined | "low" | "medium" | "high" | "xhigh" | "max",
				_budget: number,
				input: StageJudgeInput,
			) => Promise.resolve(scorecardFor(input, "STOP")),
		};

		const outcome = runGradedStages(failing, calibrating);

		expect(outcome).rejects.toThrow("minimum grade is B");
		await outcome.catch(() => undefined);
		expect(currentCalibrations).toHaveLength(1);
		expect(currentCalibrations[0]).toMatchObject({
			judgeModel: "opus",
			humanReview: calibration.humanReview,
		});
		expect(currentCalibrations[0]?.stages).toHaveLength(1);
		const stageRecord = z
			.object({
				judgeModel: z.literal("opus"),
				judgeAgreement: z.object({
					skippedCalibrations: z.number(),
					baselines: z.array(z.unknown()),
				}),
			})
			.parse(JSON.parse(await Bun.file(calibrating.stageFile("shape")).text()));
		expect(stageRecord.judgeAgreement).toEqual({
			skippedCalibrations: 0,
			baselines: [],
		});
	});

	it("preserves the stage session inputs when adding a stopped scorecard's calibration", async () => {
		const { dependencies, scorecardFor } = fakeStageDependencies();
		const context = {
			...(await stageContext()),
			model: "opus",
			effort: "high" as const,
			calibrateStageFailure: (): Promise<CalibrationResult> =>
				Promise.resolve({
					humanReview: { verdict: "REJECT", summary: "failed", findings: [] },
					instructionsChanged: false,
					rubricChanged: false,
					stageRubricsChanged: [],
				}),
		};
		const failing = {
			...dependencies,
			runStageJudge: (
				_model: string,
				_effort: undefined | "low" | "medium" | "high" | "xhigh" | "max",
				_budget: number,
				input: StageJudgeInput,
			) => Promise.resolve(scorecardFor(input, "STOP")),
		};

		const outcome = runGradedStages(failing, context);

		expect(outcome).rejects.toThrow("minimum grade is B");
		await outcome.catch(() => undefined);

		const stageRecord = z
			.object({
				calibration: z.object({
					humanReview: z.object({ verdict: z.literal("REJECT") }),
				}),
				corpusFiles: z.array(
					z.object({ path: z.string(), sha256: z.string() }),
				),
				model: z.string(),
				effort: z.string(),
			})
			.parse(JSON.parse(await Bun.file(context.stageFile("shape")).text()));
		expect(stageRecord).toEqual({
			calibration: { humanReview: { verdict: "REJECT" } },
			corpusFiles: [
				{
					path: "skills/shape/SKILL.md",
					sha256: createHash("sha256").update("shape").digest("hex"),
				},
			],
			model: "opus",
			effort: "high",
		});
	});

	it("writes an uncalibrated stopped stage when no pause collects a review", async () => {
		const { dependencies, scorecardFor } = fakeStageDependencies();
		const asked: string[] = [];
		const context = {
			...(await stageContext()),
			calibrateStageFailure: () => {
				asked.push("calibrate");

				return Promise.resolve(undefined);
			},
			collectJudgeAgreement: () =>
				Promise.reject(new Error("no agreement without a calibration")),
		};
		const failing = {
			...dependencies,
			runStageJudge: (
				_model: string,
				_effort: undefined | "low" | "medium" | "high" | "xhigh" | "max",
				_budget: number,
				input: StageJudgeInput,
			) => Promise.resolve(scorecardFor(input, "STOP")),
		};

		const outcome = runGradedStages(failing, context);

		expect(outcome).rejects.toThrow("minimum grade is B");
		await outcome.catch(() => undefined);
		expect(asked).toEqual(["calibrate"]);
		const stageRecord: unknown = JSON.parse(
			await Bun.file(context.stageFile("shape")).text(),
		);
		expect(stageRecord).toMatchObject({ stage: "shape" });
		expect(stageRecord).not.toHaveProperty("calibration");
		expect(stageRecord).not.toHaveProperty("judgeAgreement");
	});

	it("retains commit subjects when calibrating a stopped delivery", async () => {
		const { dependencies, scorecardFor } = fakeStageDependencies();
		const context = {
			...(await stageContext()),
			pipeline: {
				statuses: ["To Do", "Done"],
				target: TEST_TARGET,
				stages: [deliveryStage],
			},
			calibrateStageFailure: (): Promise<CalibrationResult> =>
				Promise.resolve({
					humanReview: { verdict: "REJECT", summary: "failed", findings: [] },
					instructionsChanged: false,
					rubricChanged: false,
					stageRubricsChanged: [],
				}),
		};
		const failing = {
			...dependencies,
			runStageJudge: (
				_model: string,
				_effort: undefined | "low" | "medium" | "high" | "xhigh" | "max",
				_budget: number,
				input: StageJudgeInput,
			) => Promise.resolve(scorecardFor(input, "STOP")),
		};

		const outcome = runGradedStages(failing, context);
		expect(outcome).rejects.toThrow("minimum grade is B");
		await outcome.catch(() => undefined);

		const calibratedRecord: unknown = JSON.parse(
			await Bun.file(context.stageFile("build")).text(),
		);
		const calibrated = z
			.object({
				input: z.object({ commitSubjects: z.array(z.string()) }),
				calibration: z.object({
					humanReview: z.object({ verdict: z.literal("REJECT") }),
				}),
			})
			.parse(calibratedRecord);
		expect(calibrated.input.commitSubjects).toEqual(["build commit"]);
		expect(calibrated.calibration.humanReview.verdict).toBe("REJECT");
	});
});

describe(captureRunBaseline.name, () => {
	it("captures the normal run baseline from the pipeline target", async () => {
		const events: string[] = [];
		const target = {
			checks: [{ command: ["bun", "run", "custom-baseline"] }],
			integrityFiles: ["custom-check.json"],
		};
		const hashes = new Map([["custom-check.json", "hash"]]);
		const context = [{ path: "base.txt", content: "base\n" }];

		const baseline = await captureRunBaseline(
			{
				runChecks: (targetDir, label, checks) => {
					events.push(`${targetDir}:${label}:${checks[0]?.command.join(" ")}`);

					return Promise.resolve();
				},
				assertWorkspaceCleanAt: (targetDir, sha) => {
					events.push(`${targetDir}:clean:${sha}`);

					return Promise.resolve();
				},
				captureFileHashes: (targetDir, integrityFiles) => {
					events.push(`${targetDir}:hash:${integrityFiles.join(",")}`);

					return Promise.resolve(hashes);
				},
				captureBaselineContext: (targetDir) => {
					events.push(`${targetDir}:context`);

					return Promise.resolve(context);
				},
			},
			{ root: "/target", sha: "source-sha" },
			target,
		);

		expect(events).toEqual([
			"/target:Baseline checks:bun run custom-baseline",
			"/target:clean:source-sha",
			"/target:hash:custom-check.json",
			"/target:context",
		]);
		expect(baseline).toEqual({
			baselineHashes: hashes,
			baselineContext: context,
			baselineChecks: {
				status: "PASS",
				evidence: [
					{
						source: "local-checks",
						path: "bun run custom-baseline",
						claim: "All baseline checks exited successfully",
					},
				],
			},
		});
	});

	it("refuses a target whose declared baseline check fails, naming the command and exit code", async () => {
		const failure = new CommandError(
			["bun", "run", "test:unit"],
			1,
			"",
			"15 pass, 1 fail",
		);

		const refusal = await failureOf(
			captureRunBaseline(
				{
					runChecks: () => Promise.reject(failure),
					assertWorkspaceCleanAt: () => Promise.resolve(),
					captureFileHashes: () => Promise.resolve(new Map()),
					captureBaselineContext: () => Promise.resolve([]),
				},
				{ root: "/target", sha: "source-sha" },
				{
					checks: [{ command: ["bun", "run", "test:unit"] }],
					integrityFiles: [],
				},
			),
		);

		expect(refusal).toBeInstanceOf(RefusedPreconditionError);
		expect(refusal.message).toBe(
			"Baseline check failed (exit 1): bun run test:unit",
		);
	});

	it("refuses a real target repository whose declared check exits non-zero", async () => {
		const repository = await testResources.createRepository();
		await Bun.write(
			join(repository.directory, "package.json"),
			'{"scripts":{"test:unit":"exit 1"}}\n',
		);
		await commitAll(repository.directory, "chore: fail test:unit");

		const refusal = await failureOf(
			captureRunBaseline(
				{
					runChecks: (targetDir, label, checks) =>
						runChecks(targetDir, label, checks, () => undefined),
					assertWorkspaceCleanAt: () => Promise.resolve(),
					captureFileHashes: () => Promise.resolve(new Map()),
					captureBaselineContext: () => Promise.resolve([]),
				},
				{ root: repository.directory, sha: repository.sha },
				{
					checks: [{ command: ["bun", "run", "test:unit"] }],
					integrityFiles: [],
				},
			),
		);

		expect(refusal).toBeInstanceOf(RefusedPreconditionError);
		expect(refusal.message).toBe(
			"Baseline check failed (exit 1): bun run test:unit",
		);
	});

	it("leaves an unrelated dependency failure unconverted, distinct from a refusal", async () => {
		const bug = new Error(
			"assertWorkspaceCleanAt threw for an unrelated reason",
		);

		const failure = await failureOf(
			captureRunBaseline(
				{
					runChecks: () => Promise.resolve(),
					assertWorkspaceCleanAt: () => Promise.reject(bug),
					captureFileHashes: () => Promise.resolve(new Map()),
					captureBaselineContext: () => Promise.resolve([]),
				},
				{ root: "/target", sha: "source-sha" },
				{ checks: [], integrityFiles: [] },
			),
		);

		expect(failure).toBe(bug);
		expect(failure).not.toBeInstanceOf(RefusedPreconditionError);
	});
});

describe(buildRunManifest.name, () => {
	it("records the resolved Judge model in run evidence", async () => {
		const config = parseArgs(
			[
				"--target",
				"/tmp/target",
				"--model",
				"sonnet",
				"--session-budget-usd",
				"5",
			],
			{},
			{
				caseId: "audit-log",
				pipelinePath: AUDIT_LOG_PIPELINE_PATH,
				targetPath: "/tmp/target",
			},
		);
		const pipeline = await loadDefaultPipeline();

		const manifest = buildRunManifest({
			timestamp: "2026-09-02T00:00:00.000Z",
			controlSha: "control-sha",
			source: { root: "/tmp/target", sha: "source-sha" },
			taskId: "TASK-1",
			taskSha: "task-sha",
			task: "Task",
			productBrief: "Brief",
			config,
			pipeline,
		});
		const artifact = buildRunArtifact({
			...artifactInputs(pipeline, config.pipelinePath),
			config,
		});

		expect({
			manifest: {
				caseId: manifest.caseId,
				model: manifest.model,
				judgeModel: manifest.judgeModel,
			},
			artifact: {
				caseId: artifact.caseId,
				model: artifact.model,
				judgeModel: artifact.judgeModel,
			},
		}).toEqual({
			manifest: { caseId: "audit-log", model: "sonnet", judgeModel: "opus" },
			artifact: { caseId: "audit-log", model: "sonnet", judgeModel: "opus" },
		});
	});

	it("carries the baseline check result a proceeding run captured", async () => {
		const config = parseArgs(
			[
				"--target",
				"/tmp/target",
				"--model",
				"sonnet",
				"--session-budget-usd",
				"5",
			],
			{},
			{
				caseId: "audit-log",
				pipelinePath: AUDIT_LOG_PIPELINE_PATH,
				targetPath: "/tmp/target",
			},
		);
		const pipeline = await loadDefaultPipeline();
		const baselineChecks: LocalCheckResult = {
			status: "PASS",
			evidence: [
				{
					source: "local-checks",
					path: "bun run test:unit",
					claim: "All baseline checks exited successfully",
				},
			],
		};

		const manifest = buildRunManifest({
			timestamp: "2026-09-02T00:00:00.000Z",
			controlSha: "control-sha",
			source: { root: "/tmp/target", sha: "source-sha" },
			taskId: "TASK-1",
			taskSha: "task-sha",
			task: "Task",
			productBrief: "Brief",
			config,
			pipeline,
			baselineChecks,
		});

		expect(manifest.baselineChecks).toEqual(baselineChecks);
	});

	it("records the minimum grade the run's stages must reach", async () => {
		const config = parseArgs(
			[
				"--target",
				"/tmp/target",
				"--model",
				"sonnet",
				"--session-budget-usd",
				"5",
				"--minimum-grade",
				"C",
			],
			{},
			{
				caseId: "audit-log",
				pipelinePath: AUDIT_LOG_PIPELINE_PATH,
				targetPath: "/tmp/target",
			},
		);

		const manifest = buildRunManifest({
			timestamp: "2026-09-02T00:00:00.000Z",
			controlSha: "control-sha",
			source: { root: "/tmp/target", sha: "source-sha" },
			taskId: "TASK-1",
			taskSha: "task-sha",
			task: "Task",
			productBrief: "Brief",
			config,
			pipeline: await loadDefaultPipeline(),
		});

		expect(manifest.minimumGrade).toBe("C");
	});
});

describe(buildRunArtifact.name, () => {
	describe(runFinalJudge.name, () => {
		it("writes the failed main artifact after two rejected payloads", async () => {
			const directory = await mkdtemp(join(tmpdir(), "rehearse-final-judge-"));
			testResources.track(directory);
			const artifactFile = join(directory, "run.json");
			const persistence = new ControlledRunArtifactPersistence();
			const abort = createRunAbort(
				{
					killActiveCommands: () => Promise.resolve(),
					registerSignal: () => undefined,
					releaseSignal: () => undefined,
					exit: () => undefined,
					reportError: () => undefined,
					persistence,
				},
				{
					artifactFile,
					teardown: () => Promise.resolve(),
				},
			);
			const pipeline = await loadDefaultPipeline();
			const baseInputs = artifactBaseInputs(pipeline, AUDIT_LOG_PIPELINE_PATH);
			const rubric = RUBRIC_IDS.map(
				(id, index) => `${index + 1}. \`${id}\`: ${id} requirement.`,
			).join("\n");
			const invalidGrade = withFirstRequirement(completeGrade("PASS"), {
				...requirement(RUBRIC_IDS[0], "PASS"),
				evidence: [
					{
						source: "diff",
						path: "src/missing.ts",
						claim: "unavailable evidence",
					},
				],
			});
			let calls = 0;
			const result = runFinalJudge({
				artifactInputs: {
					...baseInputs,
					rubric,
					rubricIds: RUBRIC_IDS,
					evidence: {
						...baseInputs.evidence,
						changedPaths: ["src/audit/example.ts"],
					},
				},
				writeFailedArtifact: abort.writeFailedArtifact,
				elapsedMs: () => 6400,
				invoke: () => {
					calls += 1;

					return Promise.resolve(
						JSON.stringify({
							session_id: "judge-session",
							total_cost_usd: 0.1,
							structured_output: invalidGrade,
						}),
					);
				},
			});

			expect(result).rejects.toBeInstanceOf(JudgeOutputValidationError);
			await result.catch(() => undefined);

			const artifact: unknown = JSON.parse(
				persistence.files.get(artifactFile) ?? "",
			);
			expect(calls).toBe(2);
			expect(artifact).toMatchObject({
				status: "FAILED",
				elapsedMs: 6400,
				workflow: [],
				stageScorecards: [],
				judgeAttempts: [
					{ outcome: "REJECTED", costUsd: 0.1 },
					{ outcome: "REJECTED", costUsd: 0.1 },
				],
				judgeCostUsd: 0.2,
				failure:
					"Judge cited unavailable evidence for tests: diff:src/missing.ts",
			});
			expect(artifact).not.toHaveProperty("grade");
		});
	});

	describe(judgeRun.name, () => {
		it("builds the graded artifact with the run clock read once the judge returns", async () => {
			const pipeline = await loadDefaultPipeline();
			const baseInputs = artifactBaseInputs(pipeline, AUDIT_LOG_PIPELINE_PATH);
			const rubric = RUBRIC_IDS.map(
				(id, index) => `${index + 1}. \`${id}\`: ${id} requirement.`,
			).join("\n");
			let clockMs = 1000;

			const artifact = await judgeRun({
				artifactInputs: {
					...baseInputs,
					rubric,
					rubricIds: RUBRIC_IDS,
					evidence: {
						...baseInputs.evidence,
						changedPaths: ["src/audit/example.ts"],
					},
				},
				writeFailedArtifact: () => Promise.resolve(),
				reviewFile: "/runs/review.md",
				elapsedMs: () => clockMs,
				invoke: () => {
					clockMs += 5000;

					return Promise.resolve(
						JSON.stringify({
							session_id: "judge-session",
							total_cost_usd: 0.1,
							structured_output: completeGrade("PASS"),
						}),
					);
				},
			});

			expect(artifact).toMatchObject({
				status: "AWAITING_HUMAN_REVIEW",
				elapsedMs: 6000,
				reviewFile: "/runs/review.md",
			});
		});
	});

	it("builds a failed artifact from rejected final Judge attempts", async () => {
		const pipeline = await loadDefaultPipeline();
		const attempts: readonly JudgeAttempt[] = [
			{
				payload: { summary: "first invalid payload" },
				costUsd: 0.1,
				outcome: "REJECTED",
				error: "first validation error",
			},
			{
				payload: { summary: "second invalid payload" },
				costUsd: 0.2,
				outcome: "REJECTED",
				error: "second validation error",
			},
		];
		const failure = new JudgeOutputValidationError({
			message: "second validation error",
			prompt: "original prompt",
			attempts,
			costUsd: 0.3,
		});

		const artifact = buildFailedJudgeRunArtifact(
			artifactBaseInputs(pipeline, AUDIT_LOG_PIPELINE_PATH),
			failure,
		);

		expect(artifact).toMatchObject({
			status: "FAILED",
			workflow: [],
			stageScorecards: [],
			baselineContext: [],
			diff: "the-diff",
			changedPaths: ["src/example.ts"],
			checkIntegrity: harnessResult("PASS", "checks match"),
			localChecks: harnessResult("PASS", "all green"),
			judgePrompt: "original prompt",
			judgeAttempts: attempts,
			judgeCostUsd: 0.3,
			failure: "second validation error",
		});
		expect("grade" in artifact).toBe(false);
	});

	it("records successful final Judge attempts and aggregate cost", async () => {
		const pipeline = await loadDefaultPipeline();
		const attempts: readonly JudgeAttempt[] = [
			{
				payload: { summary: "invalid" },
				costUsd: 0.1,
				outcome: "REJECTED",
				error: "invalid evidence",
			},
			{
				payload: { summary: "accepted" },
				costUsd: 0.2,
				outcome: "ACCEPTED",
			},
		];
		const inputs = artifactInputs(pipeline, AUDIT_LOG_PIPELINE_PATH);

		const artifact = buildRunArtifact({
			...inputs,
			judge: { ...inputs.judge, attempts, costUsd: 0.3 },
		});

		expect(artifact.judgeAttempts).toBe(attempts);
		expect(artifact.judgeCostUsd).toBeCloseTo(0.3);
	});

	it("records the run's elapsed time and the Product Owner's provider calls", async () => {
		const pipeline = await loadDefaultPipeline();
		const productOwnerCalls = [
			{
				metrics: {
					costUsd: 0.5,
					inputTokens: 1,
					outputTokens: 2,
					cacheReadTokens: 3,
					cacheWriteTokens: 4,
					turns: 1,
				},
			},
		];
		const inputs = artifactInputs(pipeline, AUDIT_LOG_PIPELINE_PATH);

		const artifact = buildRunArtifact({
			...inputs,
			productOwner: {
				sessionId: "po",
				spentUsd: 0.5,
				providerCalls: productOwnerCalls,
			},
			elapsedMs: 90_000,
		});

		expect(artifact).toMatchObject({
			elapsedMs: 90_000,
			productOwnerCostUsd: 0.5,
			productOwnerProviderCalls: productOwnerCalls,
		});
	});

	it("completes the final artifact with calibration and Judge agreement", async () => {
		const pipeline = await loadDefaultPipeline();
		const awaiting = buildRunArtifact(
			artifactInputs(pipeline, AUDIT_LOG_PIPELINE_PATH),
		);
		const calibration: CalibrationResult = {
			humanReview: {
				verdict: "ACCEPT",
				summary: "The human agrees.",
				findings: [],
			},
			instructionsChanged: false,
			rubricChanged: false,
			stageRubricsChanged: [],
		};
		const judgeAgreement: JudgeAgreementReport = {
			skippedCalibrations: 1,
			baselines: [],
		};

		const completed = completeRunArtifact(
			awaiting,
			calibration,
			judgeAgreement,
		);

		expect(completed).toMatchObject({
			status: "COMPLETE",
			calibration,
			judgeAgreement,
		});
	});

	it("records the pipeline it ran and the path it came from", async () => {
		const directory = await testResources.createControlDirectory();
		const absolute = join(directory, "custom.json");
		const pipelinePath = relative(PROJECT_ROOT, absolute);
		await Bun.write(
			absolute,
			JSON.stringify({
				statuses: ["To Do", "Done"],
				target: TEST_TARGET,
				stages: [
					{
						name: "sketch",
						kind: "planning",
						skill: "discuss",
						artifact: "backlog/docs/sketch.md",
						rubric: `${AUDIT_LOG_RUBRICS_PATH}/shape.json`,
					},
					{
						name: "build",
						kind: "delivery",
						skill: "build",
						rubric: `${AUDIT_LOG_RUBRICS_PATH}/build.json`,
					},
				],
			}),
		);

		const pipeline = await loadPipeline(pipelinePath, AUDIT_LOG_RUBRICS_PATH);

		const artifact = buildRunArtifact(artifactInputs(pipeline, pipelinePath));

		expect(artifact.pipelinePath).toBe(pipelinePath);
		expect(artifact.pipeline.stages.map(({ name }) => name)).toEqual([
			"sketch",
			"build",
		]);
	});

	it("records the default pipeline when the run used it", async () => {
		const pipeline = await loadDefaultPipeline();

		const artifact = buildRunArtifact(
			artifactInputs(pipeline, AUDIT_LOG_PIPELINE_PATH),
		);

		expect(artifact.pipelinePath).toBe(AUDIT_LOG_PIPELINE_PATH);
		expect(artifact.pipeline.stages.map(({ name }) => name)).toEqual([
			"shape",
			"build",
		]);
	});

	it("records the same path whichever way the run named the pipeline", async () => {
		const asConfigured = (pipelineArgument: string): string =>
			parseArgs(
				[
					"--target",
					"/tmp/target",
					"--model",
					"sonnet",
					"--session-budget-usd",
					"5",
					"--pipeline",
					pipelineArgument,
				],
				{},
				{
					caseId: "audit-log",
					pipelinePath: AUDIT_LOG_PIPELINE_PATH,
					targetPath: "/tmp/target",
				},
			).pipelinePath;

		const pipeline = await loadDefaultPipeline();
		const recorded = [
			AUDIT_LOG_PIPELINE_PATH,
			join(PROJECT_ROOT, AUDIT_LOG_PIPELINE_PATH),
			`${AUDIT_LOG_RUBRICS_PATH}/../pipelines/default.json`,
		].map(
			(argument) =>
				buildRunArtifact(artifactInputs(pipeline, asConfigured(argument)))
					.pipelinePath,
		);

		expect(recorded).toEqual([
			AUDIT_LOG_PIPELINE_PATH,
			AUDIT_LOG_PIPELINE_PATH,
			AUDIT_LOG_PIPELINE_PATH,
		]);
	});
});

describe(pausesOnFailure.name, () => {
	it.each([
		{ pause: false, stageFailureCalibrated: false, stops: false },
		{ pause: false, stageFailureCalibrated: true, stops: false },
		{ pause: true, stageFailureCalibrated: false, stops: true },
		{ pause: true, stageFailureCalibrated: true, stops: false },
	])(
		"stops for the reviewer: $stops when pause is $pause and the stage was calibrated $stageFailureCalibrated",
		({ pause, stageFailureCalibrated, stops }) => {
			expect(pausesOnFailure(pause, stageFailureCalibrated)).toBe(stops);
		},
	);
});

describe(pauseForFailureInspection.name, () => {
	it("asks the reviewer to inspect the target before it is restored", async () => {
		const asked: string[] = [];
		const reported: string[] = [];

		await pauseForFailureInspection(
			{
				question: (prompt) => {
					asked.push(prompt);

					return Promise.resolve("");
				},
			},
			"/tmp/target",
			(message) => {
				reported.push(message);
			},
		);

		expect(asked).toEqual([
			"The run failed. Inspect /tmp/target if useful, then press Enter to restore the target.",
		]);
		expect(reported).toEqual([]);
	});

	/**
	 * A terminal closed mid-run, on SIGHUP, makes the prompt throw
	 * ERR_USE_AFTER_CLOSE. Left bare, that error propagates in place of the
	 * failure that got the run here, so the reason the run failed is lost.
	 */
	it("restores without the prompt when stdin has closed, keeping the run's own failure", async () => {
		const reported: string[] = [];

		const settled = pauseForFailureInspection(
			{
				question: () =>
					Promise.reject(
						new Error("readline was closed [ERR_USE_AFTER_CLOSE]"),
					),
			},
			"/tmp/target",
			(message) => {
				reported.push(message);
			},
		);

		expect(settled).resolves.toBeUndefined();
		await settled;
		expect(reported).toEqual([
			"No interactive stdin; restoring the target now.",
		]);
	});
});

describe(finishGradedRun.name, () => {
	interface FinishHarness {
		readonly order: string[];
		readonly dependencies: FinishGradedRunDependencies;
	}

	function fakeFinish(): FinishHarness {
		const order: string[] = [];

		return {
			order,
			dependencies: {
				recordRetentionRef: (_targetDir, runName, sha) => {
					order.push(`retain:${runName}:${sha}`);

					return Promise.resolve();
				},
				collectCalibration: () => {
					order.push("calibrate");

					return Promise.reject(new Error("no calibration without a pause"));
				},
				collectJudgeAgreement: () => {
					order.push("agreement");

					return Promise.reject(new Error("no agreement without a pause"));
				},
				completeArtifact: () => {
					order.push("complete");

					return Promise.resolve();
				},
				awaitArtifactReview: () => {
					order.push("await-review");

					return Promise.resolve();
				},
				log: () => undefined,
			},
		};
	}

	const request: FinishGradedRunRequest = {
		pause: false,
		runName: "2026-09-03T00-00-00.000Z",
		targetDir: "/tmp/target",
		resultSha: "candidate-sha",
		artifact: buildRunArtifact(
			artifactInputs(
				{
					statuses: ["To Do", "Done"],
					target: TEST_TARGET,
					stages: [],
				},
				"pipelines/default.json",
			),
		),
		calibrationInput: {
			originalInstructions: "Instructions",
			originalRubric: "Rubric",
			finalRubricPath: "/control/rubric.md",
			rubricsDirectory: "/control/rubrics",
			stageScorecards: [],
		},
	};

	it("pins the candidate under refs/rehearse and asks nothing without a pause", async () => {
		const { order, dependencies } = fakeFinish();

		await finishGradedRun(request, dependencies);

		expect(order).toEqual([
			"await-review",
			`retain:${request.runName}:${request.resultSha}`,
		]);
	});

	it("calibrates and completes the artifact with a pause", async () => {
		const { order } = fakeFinish();
		const calibration: CalibrationResult = {
			humanReview: { verdict: "REJECT", summary: "failed", findings: [] },
			instructionsChanged: false,
			rubricChanged: false,
			stageRubricsChanged: [],
		};
		const judgeAgreement: JudgeAgreementReport = {
			skippedCalibrations: 0,
			baselines: [],
		};
		const completed: GradedRunArtifact[] = [];

		await finishGradedRun(
			{ ...request, pause: true },
			{
				recordRetentionRef: () => {
					order.push("retain");

					return Promise.resolve();
				},
				collectCalibration: () => {
					order.push("calibrate");

					return Promise.resolve(calibration);
				},
				collectJudgeAgreement: () => {
					order.push("agreement");

					return Promise.resolve(judgeAgreement);
				},
				completeArtifact: (artifact) => {
					order.push("complete");
					completed.push(artifact);

					return Promise.resolve();
				},
				awaitArtifactReview: () => {
					order.push("await-review");

					return Promise.resolve();
				},
				log: () => undefined,
			},
		);

		expect(order).toEqual(["calibrate", "agreement", "complete"]);
		expect(completed[0]?.status).toBe("COMPLETE");
		expect(completed[0]?.calibration).toBe(calibration);
		expect(completed[0]?.judgeAgreement).toBe(judgeAgreement);
	});
});

describe(retainedCheckpointRecorder.name, () => {
	it("records the checkpoint and pins its commit under refs/rehearse", async () => {
		const source = await testResources.createRepository();
		const checkpointDir = join(source.directory, ".checkpoints", "initial");

		const record = await retainedCheckpointRecorder("run-1")(
			source.directory,
			checkpointDir,
			{
				stage: "initial",
				targetSha: source.sha,
				upstream: "root-key",
				model: "sonnet",
				corpusFiles: [],
				artifacts: [],
			},
		);

		expect(record.stage).toBe("initial");
		expect(
			await Bun.file(join(checkpointDir, "checkpoint.json")).exists(),
		).toBe(true);
		const retainedSha = await runCommand(
			["git", "rev-parse", "refs/rehearse/run-1"],
			source.directory,
		);
		expect(retainedSha.trim()).toBe(source.sha);
	});
});
