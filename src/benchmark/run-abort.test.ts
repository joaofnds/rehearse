import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type {
	CalibrationResult,
	StageJudgeOutput,
	StageScorecard,
} from "./contracts";
import type { JudgeAttempt } from "./judge-attempt";
import { JudgeOutputValidationError } from "./judge-attempt";
import type { PipelineDefinition } from "./pipeline";
import { loadPipeline } from "./pipeline";
import type { RunArtifactBaseInputs, RunArtifactInputs } from "./run";
import { buildFailedJudgeRunArtifact, buildRunArtifact } from "./run";
import type { PendingStage, RunArtifactPersistence } from "./run-abort";
import {
	createRunAbort,
	fileRunArtifactPersistence,
	writeStageJudgeFailure,
} from "./run-abort";
import type { RunEventKind, RunEventRecorder } from "./run-events";
import { deriveStageGrade, parseStageRubric } from "./stage-grading";
import {
	AUDIT_LOG_PIPELINE_PATH,
	AUDIT_LOG_RUBRICS_PATH,
	harnessResult,
	TestResources,
} from "./test-support";

const testResources = TestResources.forEachTest();

function stageJudgeInput(
	stage: string,
	overrides: Partial<StageScorecard["input"]> = {},
): StageScorecard["input"] {
	return {
		stage,
		kind: stage === "build" ? "delivery" : "planning",
		task: "Task",
		productBrief: "Brief",
		instructions: "Instructions",
		baselineContext: [],
		taskState: "State",
		transcript: {
			stage,
			sessionId: "session",
			costUsd: 1,
			providerCalls: [],
			exchanges: [],
		},
		priorArtifacts: [],
		...overrides,
	};
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

function loadDefaultPipeline(): Promise<PipelineDefinition> {
	return loadPipeline(AUDIT_LOG_PIPELINE_PATH, AUDIT_LOG_RUBRICS_PATH);
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

interface BlockedRunArtifactWrite {
	readonly started: Promise<undefined>;
	readonly release: () => void;
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

function stageEvidence(
	source: StageJudgeOutput["requirements"][number]["evidence"][number]["source"],
	path: string,
): StageJudgeOutput["requirements"][number]["evidence"][number] {
	return { source, path, claim: "evidence" };
}

describe(writeStageJudgeFailure.name, () => {
	it("retains the frozen input and both rejected Judge attempts", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-stage-failure-"));
		testResources.track(directory);
		const file = join(directory, "shape.json");
		const input = stageJudgeInput("shape");
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
		const pending: PendingStage = {
			file,
			stage: "shape",
			input,
			failure: { prompt: "original prompt", attempts, costUsd: 0.3 },
		};

		await writeStageJudgeFailure(pending, "second validation error");

		expect(JSON.parse(await Bun.file(file).text())).toEqual({
			status: "STAGE_JUDGE_FAILED",
			stage: "shape",
			error: "second validation error",
			input,
			prompt: "original prompt",
			attempts,
			costUsd: 0.3,
		});
	});

	it("carries the stage's captured corpus files", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-stage-failure-"));
		testResources.track(directory);
		const file = join(directory, "build.json");
		const scorecard = stageScorecard("FAIL");
		const corpusFiles = [{ path: "CLAUDE.md", sha256: "abc123" }];
		const pending: PendingStage = {
			file,
			stage: "build",
			input: scorecard.input,
			scorecard,
			corpusFiles,
		};

		await writeStageJudgeFailure(pending, "build stage graded F");

		expect(JSON.parse(await Bun.file(file).text())).toMatchObject({
			corpusFiles,
		});
	});

	it("carries the scorecard's grade fields when a normal grade failure supplies one", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-stage-failure-"));
		testResources.track(directory);
		const file = join(directory, "discuss.json");
		const scorecard = stageScorecard("FAIL");
		const pending: PendingStage = {
			file,
			stage: "discuss",
			input: scorecard.input,
			scorecard,
		};

		await writeStageJudgeFailure(pending, "discuss stage graded F");

		expect(JSON.parse(await Bun.file(file).text())).toEqual({
			status: "STAGE_JUDGE_FAILED",
			stage: "discuss",
			error: "discuss stage graded F",
			input: scorecard.input,
			hardBlockers: scorecard.grade.hardBlockers,
			requirements: scorecard.grade.requirements,
			dimensions: scorecard.grade.dimensions,
			summary: scorecard.grade.summary,
			grade: {
				grade: scorecard.grade.grade,
				verdict: scorecard.grade.verdict,
			},
			attempts: scorecard.attempts,
			costUsd: scorecard.costUsd,
		});
	});

	it("carries the model, judge model, effort settings, and budget into the failed artifact", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-stage-failure-"));
		testResources.track(directory);
		const file = join(directory, "build.json");
		const scorecard = stageScorecard("FAIL");
		const pending: PendingStage = {
			file,
			stage: "build",
			input: scorecard.input,
			scorecard,
			model: "claude-3-5-sonnet-20241022",
			effort: "high",
			judgeModel: "claude-3-7-sonnet-20250219",
			judgeEffort: "medium",
			sessionBudgetUsd: 15,
		};

		await writeStageJudgeFailure(pending, "build stage graded F");

		expect(JSON.parse(await Bun.file(file).text())).toMatchObject({
			model: "claude-3-5-sonnet-20241022",
			effort: "high",
			judgeModel: "claude-3-7-sonnet-20250219",
			judgeEffort: "medium",
			sessionBudgetUsd: 15,
		});
	});
});

interface RecordedRunEvent {
	readonly kind: RunEventKind;
	readonly stage: string;
	readonly spentUsd: number;
	readonly elapsedMs: number;
}

interface FakeRunEventRecorder extends RunEventRecorder {
	readonly events: RecordedRunEvent[];
}

function fakeRunEventRecorder(): FakeRunEventRecorder {
	const events: RecordedRunEvent[] = [];

	return {
		events,
		record: (kind, stage, spentUsd, elapsedMs) => {
			events.push({ kind, stage, spentUsd, elapsedMs });
		},
	};
}

describe(createRunAbort.name, () => {
	it("records a stage-judging run event with the stage's own spend before the pending stage write settles", async () => {
		const persistence = new ControlledRunArtifactPersistence();
		const runEvents = fakeRunEventRecorder();
		const abort = createRunAbort(
			{
				killActiveCommands: () => Promise.resolve(),
				registerSignal: () => undefined,
				releaseSignal: () => undefined,
				exit: () => undefined,
				reportError: () => undefined,
				persistence,
				runEvents,
			},
			{
				artifactFile: "/runs/run.json",
				teardown: () => Promise.resolve(),
			},
		);

		await abort.writePendingStage({
			file: "/runs/shape.json",
			stage: "shape",
			input: stageJudgeInput("shape"),
		});

		expect(
			runEvents.events.map(({ kind, stage, spentUsd }) => ({
				kind,
				stage,
				spentUsd,
			})),
		).toEqual([{ kind: "stage-judging", stage: "shape", spentUsd: 1 }]);
	});

	it("records a stage-completed run event carrying the stage session and Judge spend when a stage finishes", async () => {
		const persistence = new ControlledRunArtifactPersistence();
		const runEvents = fakeRunEventRecorder();
		const abort = createRunAbort(
			{
				killActiveCommands: () => Promise.resolve(),
				registerSignal: () => undefined,
				releaseSignal: () => undefined,
				exit: () => undefined,
				reportError: () => undefined,
				persistence,
				runEvents,
			},
			{
				artifactFile: "/runs/run.json",
				teardown: () => Promise.resolve(),
			},
		);
		await abort.writePendingStage({
			file: "/runs/shape.json",
			stage: "shape",
			input: stageJudgeInput("shape"),
		});

		await abort.completeStage({
			...stageScorecard("PASS"),
			corpusFiles: [],
			model: "sonnet",
			judgeModel: "opus",
			sessionBudgetUsd: 5,
		});

		expect(
			runEvents.events.map(({ kind, stage }) => ({ kind, stage })),
		).toEqual([
			{ kind: "stage-judging", stage: "shape" },
			{ kind: "stage-completed", stage: "shape" },
		]);
		expect(runEvents.events.at(-1)?.spentUsd).toBe(2);
	});

	it("records elapsed time exactly as the injected elapsedMs function reports it, with no origin of its own", async () => {
		const persistence = new ControlledRunArtifactPersistence();
		const runEvents = fakeRunEventRecorder();
		const abort = createRunAbort(
			{
				killActiveCommands: () => Promise.resolve(),
				registerSignal: () => undefined,
				releaseSignal: () => undefined,
				exit: () => undefined,
				reportError: () => undefined,
				persistence,
				runEvents,
				elapsedMs: () => 500,
			},
			{
				artifactFile: "/runs/run.json",
				teardown: () => Promise.resolve(),
			},
		);

		await abort.writePendingStage({
			file: "/runs/shape.json",
			stage: "shape",
			input: stageJudgeInput("shape"),
		});
		await abort.completeStage({
			...stageScorecard("PASS"),
			corpusFiles: [],
			model: "sonnet",
			judgeModel: "opus",
			sessionBudgetUsd: 5,
		});

		expect(runEvents.events.map(({ elapsedMs }) => elapsedMs)).toEqual([
			500, 500,
		]);
	});

	it("records a run-completed run event when the artifact reaches its terminal write", async () => {
		const persistence = new ControlledRunArtifactPersistence();
		const runEvents = fakeRunEventRecorder();
		const pipeline = await loadDefaultPipeline();
		const artifact = buildRunArtifact(
			artifactInputs(pipeline, AUDIT_LOG_PIPELINE_PATH),
		);
		const abort = createRunAbort(
			{
				killActiveCommands: () => Promise.resolve(),
				registerSignal: () => undefined,
				releaseSignal: () => undefined,
				exit: () => undefined,
				reportError: () => undefined,
				persistence,
				runEvents,
				elapsedMs: () => 500,
			},
			{
				artifactFile: "/runs/run.json",
				teardown: () => Promise.resolve(),
			},
		);

		await abort.completeArtifact({ ...artifact, status: "COMPLETE" });

		expect(runEvents.events.map(({ kind }) => kind)).toEqual(["run-completed"]);
		expect(runEvents.events.at(-1)?.elapsedMs).toBe(500);
	});

	it("records a run-completed run event when a paused run's artifact awaits review", async () => {
		const persistence = new ControlledRunArtifactPersistence();
		const runEvents = fakeRunEventRecorder();
		const pipeline = await loadDefaultPipeline();
		const artifact = buildRunArtifact(
			artifactInputs(pipeline, AUDIT_LOG_PIPELINE_PATH),
		);
		const abort = createRunAbort(
			{
				killActiveCommands: () => Promise.resolve(),
				registerSignal: () => undefined,
				releaseSignal: () => undefined,
				exit: () => undefined,
				reportError: () => undefined,
				persistence,
				runEvents,
				elapsedMs: () => 500,
			},
			{
				artifactFile: "/runs/run.json",
				teardown: () => Promise.resolve(),
			},
		);
		await abort.writePendingArtifact(artifact);

		await abort.awaitArtifactReview();

		expect(runEvents.events.map(({ kind }) => kind)).toEqual(["run-completed"]);
		expect(runEvents.events.at(-1)?.elapsedMs).toBe(500);
	});

	it("records an interrupted pending stage as failed after the active write settles", async () => {
		const persistence = new ControlledRunArtifactPersistence();
		const stageFile = "/runs/shape.json";
		const blocked = persistence.blockNextWrite();
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
		const pending: PendingStage = {
			file: stageFile,
			stage: "shape",
			input: stageJudgeInput("shape"),
		};

		const pendingWrite = abort.writePendingStage(pending);
		await blocked.started;
		const abortWrite = abort.markAborted("run interrupted");
		blocked.release();
		await Promise.all([pendingWrite, abortWrite]);

		expect(JSON.parse(persistence.files.get(stageFile) ?? "")).toMatchObject({
			status: "STAGE_JUDGE_FAILED",
			error: "run interrupted",
		});
	});

	it("records a terminal run-failed event when an abort fails a pending stage, so an attached SSE client stops waiting", async () => {
		const persistence = new ControlledRunArtifactPersistence();
		const runEvents = fakeRunEventRecorder();
		const stageFile = "/runs/shape.json";
		const abort = createRunAbort(
			{
				killActiveCommands: () => Promise.resolve(),
				registerSignal: () => undefined,
				releaseSignal: () => undefined,
				exit: () => undefined,
				reportError: () => undefined,
				persistence,
				runEvents,
			},
			{
				artifactFile: "/runs/run.json",
				teardown: () => Promise.resolve(),
			},
		);

		await abort.writePendingStage({
			file: stageFile,
			stage: "shape",
			input: stageJudgeInput("shape"),
		});
		await abort.markAborted("run interrupted");

		expect(runEvents.events.map(({ kind }) => kind)).toEqual([
			"stage-judging",
			"run-failed",
		]);
	});

	it("records a terminal run-failed event when an abort fails a pending run artifact", async () => {
		const persistence = new ControlledRunArtifactPersistence();
		const runEvents = fakeRunEventRecorder();
		const artifactFile = "/runs/run.json";
		const pipeline = await loadDefaultPipeline();
		const artifact = buildRunArtifact(
			artifactInputs(pipeline, AUDIT_LOG_PIPELINE_PATH),
		);
		const abort = createRunAbort(
			{
				killActiveCommands: () => Promise.resolve(),
				registerSignal: () => undefined,
				releaseSignal: () => undefined,
				exit: () => undefined,
				reportError: () => undefined,
				persistence,
				runEvents,
			},
			{
				artifactFile,
				teardown: () => Promise.resolve(),
			},
		);

		await abort.writePendingArtifact(artifact);
		await abort.markAborted("run interrupted");

		expect(runEvents.events.map(({ kind }) => kind)).toEqual(["run-failed"]);
	});

	it("records a terminal run-failed event when abort has no pending stage or artifact, so a bare signal abort still ends the SSE stream", async () => {
		const persistence = new ControlledRunArtifactPersistence();
		const runEvents = fakeRunEventRecorder();
		const abort = createRunAbort(
			{
				killActiveCommands: () => Promise.resolve(),
				registerSignal: () => undefined,
				releaseSignal: () => undefined,
				exit: () => undefined,
				reportError: () => undefined,
				persistence,
				runEvents,
			},
			{
				artifactFile: "/runs/run.json",
				teardown: () => Promise.resolve(),
			},
		);

		await abort.markAborted("run interrupted");

		expect(runEvents.events.map(({ kind }) => kind)).toEqual(["run-failed"]);
	});

	it("records a terminal run-failed event when writeFailedArtifact persists a final Judge failure", async () => {
		const persistence = new ControlledRunArtifactPersistence();
		const runEvents = fakeRunEventRecorder();
		const artifactFile = "/runs/run.json";
		const pipeline = await loadDefaultPipeline();
		const judgeFailure = new JudgeOutputValidationError({
			message: "invalid Judge output",
			prompt: "judge prompt",
			attempts: [],
			costUsd: 0,
		});
		const artifact = buildFailedJudgeRunArtifact(
			artifactBaseInputs(pipeline, AUDIT_LOG_PIPELINE_PATH),
			judgeFailure,
		);
		const abort = createRunAbort(
			{
				killActiveCommands: () => Promise.resolve(),
				registerSignal: () => undefined,
				releaseSignal: () => undefined,
				exit: () => undefined,
				reportError: () => undefined,
				persistence,
				runEvents,
			},
			{
				artifactFile,
				teardown: () => Promise.resolve(),
			},
		);

		await abort.writeFailedArtifact(artifact);

		expect(runEvents.events.map(({ kind }) => kind)).toEqual(["run-failed"]);
	});

	it("records pending stage state when abort precedes its first write", async () => {
		const persistence = new ControlledRunArtifactPersistence();
		const stageFile = "/runs/shape.json";
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

		const pendingWrite = abort.writePendingStage({
			file: stageFile,
			stage: "shape",
			input: stageJudgeInput("shape"),
		});
		const abortWrite = abort.markAborted("run interrupted");
		await Promise.all([pendingWrite, abortWrite]);

		expect(JSON.parse(persistence.files.get(stageFile) ?? "")).toMatchObject({
			status: "STAGE_JUDGE_FAILED",
		});
	});

	it("refuses a normal stage transition after abort is requested", async () => {
		const persistence = new ControlledRunArtifactPersistence();
		const stageFile = "/runs/shape.json";
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
		await abort.writePendingStage({
			file: stageFile,
			stage: "shape",
			input: stageJudgeInput("shape"),
		});

		const abortWrite = abort.markAborted("run interrupted");
		const completionWrite = abort.completeStage({
			...stageScorecard("PASS"),
			corpusFiles: [],
			model: "sonnet",
			judgeModel: "opus",
			sessionBudgetUsd: 5,
		});
		await Promise.all([abortWrite, completionWrite]);

		expect(JSON.parse(persistence.files.get(stageFile) ?? "")).toMatchObject({
			status: "STAGE_JUDGE_FAILED",
		});
	});

	it("does not start a queued normal stage transition after abort is requested", async () => {
		const persistence = new ControlledRunArtifactPersistence();
		const stageFile = "/runs/shape.json";
		const blocked = persistence.blockNextWrite();
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

		const pendingWrite = abort.writePendingStage({
			file: stageFile,
			stage: "shape",
			input: stageJudgeInput("shape"),
		});
		await blocked.started;
		const completionWrite = abort.completeStage({
			...stageScorecard("PASS"),
			corpusFiles: [],
			model: "sonnet",
			judgeModel: "opus",
			sessionBudgetUsd: 5,
		});
		const abortWrite = abort.markAborted("run interrupted");
		blocked.release();
		await Promise.all([pendingWrite, completionWrite, abortWrite]);

		expect(
			persistence.writes.map(
				(contents) =>
					z.object({ status: z.string() }).parse(JSON.parse(contents)).status,
			),
		).toEqual(["AWAITING_STAGE_JUDGE", "STAGE_JUDGE_FAILED"]);
	});

	it("records an interrupted pending run artifact as failed after the active write settles", async () => {
		const persistence = new ControlledRunArtifactPersistence();
		const artifactFile = "/runs/run.json";
		const pipeline = await loadDefaultPipeline();
		const artifact = buildRunArtifact(
			artifactInputs(pipeline, AUDIT_LOG_PIPELINE_PATH),
		);
		const blocked = persistence.blockNextWrite();
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

		const pendingWrite = abort.writePendingArtifact(artifact);
		await blocked.started;
		const abortWrite = abort.markAborted("run interrupted");
		blocked.release();
		await Promise.all([pendingWrite, abortWrite]);

		expect(JSON.parse(persistence.files.get(artifactFile) ?? "")).toEqual({
			...artifact,
			status: "FAILED",
		});
	});

	/**
	 * A run without `--pause` deliberately leaves the artifact awaiting review
	 * and then restores the target, which is seconds of git work with the
	 * signal handlers still registered. The artifact is not pending during
	 * that window: it is finished, and rewriting it FAILED would strand
	 * evidence `loadRecord` then refuses to read.
	 */
	it("leaves an artifact awaiting review alone when a signal arrives", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-run-await-"));
		testResources.track(directory);
		const artifactFile = join(directory, "run.json");
		const pipeline = await loadDefaultPipeline();
		const artifact = buildRunArtifact(
			artifactInputs(pipeline, AUDIT_LOG_PIPELINE_PATH),
		);
		const handlers = new Map<
			NodeJS.Signals,
			(signal: NodeJS.Signals) => void
		>();
		const exited = Promise.withResolvers<number>();
		const abort = createRunAbort(
			{
				killActiveCommands: () => Promise.resolve(),
				registerSignal: (signal, handler) => {
					handlers.set(signal, handler);
				},
				releaseSignal: () => undefined,
				exit: exited.resolve,
				reportError: () => undefined,
				persistence: fileRunArtifactPersistence,
			},
			{ artifactFile, teardown: () => Promise.resolve() },
		);

		await abort.writePendingArtifact(artifact);
		await abort.awaitArtifactReview();
		handlers.get("SIGINT")?.("SIGINT");
		await exited.promise;

		expect(JSON.parse(await Bun.file(artifactFile).text())).toEqual(artifact);
	});

	it("retains completed calibration when completion is interrupted", async () => {
		const persistence = new ControlledRunArtifactPersistence();
		const artifactFile = "/runs/run.json";
		const pipeline = await loadDefaultPipeline();
		const artifact = buildRunArtifact(
			artifactInputs(pipeline, AUDIT_LOG_PIPELINE_PATH),
		);
		const calibration: CalibrationResult = {
			humanReview: { verdict: "ACCEPT", summary: "accepted", findings: [] },
			instructionsChanged: false,
			rubricChanged: false,
			stageRubricsChanged: [],
		};
		const completeArtifact = {
			...artifact,
			status: "COMPLETE" as const,
			calibration,
		};
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
		await abort.writePendingArtifact(artifact);
		const blocked = persistence.blockNextWrite();

		const completionWrite = abort.completeArtifact(completeArtifact);
		await blocked.started;
		const abortWrite = abort.markAborted("run interrupted");
		blocked.release();
		await Promise.all([completionWrite, abortWrite]);

		expect(JSON.parse(persistence.files.get(artifactFile) ?? "")).toEqual({
			...completeArtifact,
			status: "FAILED",
		});
	});

	it("runs at most one artifact transition at a time", async () => {
		const persistence = new ControlledRunArtifactPersistence();
		const artifactFile = "/runs/run.json";
		const pipeline = await loadDefaultPipeline();
		const artifact = buildRunArtifact(
			artifactInputs(pipeline, AUDIT_LOG_PIPELINE_PATH),
		);
		const blocked = persistence.blockNextWrite();
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

		const pendingWrite = abort.writePendingArtifact(artifact);
		await blocked.started;
		const completionWrite = abort.completeArtifact({
			...artifact,
			status: "COMPLETE",
		});
		blocked.release();
		await Promise.all([pendingWrite, completionWrite]);

		expect(persistence.maxActiveWrites).toBe(1);
	});

	it("leaves a successful terminal artifact unchanged on a later abort", async () => {
		const persistence = new ControlledRunArtifactPersistence();
		const artifactFile = "/runs/run.json";
		const pipeline = await loadDefaultPipeline();
		const artifact = buildRunArtifact(
			artifactInputs(pipeline, AUDIT_LOG_PIPELINE_PATH),
		);
		const completeArtifact = { ...artifact, status: "COMPLETE" as const };
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

		await abort.writePendingArtifact(artifact);
		await abort.completeArtifact(completeArtifact);
		await abort.markAborted("later failure");

		expect(JSON.parse(persistence.files.get(artifactFile) ?? "")).toEqual(
			completeArtifact,
		);
	});

	it("retains pending state after a terminal artifact write fails", async () => {
		const persistence = new ControlledRunArtifactPersistence();
		const artifactFile = "/runs/run.json";
		const pipeline = await loadDefaultPipeline();
		const artifact = buildRunArtifact(
			artifactInputs(pipeline, AUDIT_LOG_PIPELINE_PATH),
		);
		const completeArtifact = { ...artifact, status: "COMPLETE" as const };
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
		await abort.writePendingArtifact(artifact);
		const failure = persistence.failNextWrite();

		expect(abort.completeArtifact(completeArtifact)).rejects.toBe(failure);
		await abort.markAborted("run failed");

		expect(JSON.parse(persistence.files.get(artifactFile) ?? "")).toEqual({
			...completeArtifact,
			status: "FAILED",
		});
	});

	it("retries a failed final Judge artifact during abort recording", async () => {
		const persistence = new ControlledRunArtifactPersistence();
		const artifactFile = "/runs/run.json";
		const pipeline = await loadDefaultPipeline();
		const judgeFailure = new JudgeOutputValidationError({
			message: "invalid Judge output",
			prompt: "judge prompt",
			attempts: [],
			costUsd: 0,
		});
		const artifact = buildFailedJudgeRunArtifact(
			artifactBaseInputs(pipeline, AUDIT_LOG_PIPELINE_PATH),
			judgeFailure,
		);
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
		const persistenceFailure = persistence.failNextWrite();

		expect(abort.writeFailedArtifact(artifact)).rejects.toBe(
			persistenceFailure,
		);
		await abort.markAborted("run failed");

		expect(JSON.parse(persistence.files.get(artifactFile) ?? "")).toEqual(
			artifact,
		);
	});

	it("does not rewrite a successfully persisted final Judge failure", async () => {
		const persistence = new ControlledRunArtifactPersistence();
		const artifactFile = "/runs/run.json";
		const pipeline = await loadDefaultPipeline();
		const judgeFailure = new JudgeOutputValidationError({
			message: "invalid Judge output",
			prompt: "judge prompt",
			attempts: [],
			costUsd: 0,
		});
		const artifact = buildFailedJudgeRunArtifact(
			artifactBaseInputs(pipeline, AUDIT_LOG_PIPELINE_PATH),
			judgeFailure,
		);
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

		await abort.writeFailedArtifact(artifact);
		await abort.markAborted("later failure");

		expect(persistence.writes).toHaveLength(1);
	});

	it("records a single run-failed event when abort follows a persisted final Judge failure, not a second empty one", async () => {
		const persistence = new ControlledRunArtifactPersistence();
		const artifactFile = "/runs/run.json";
		const pipeline = await loadDefaultPipeline();
		const runEvents = fakeRunEventRecorder();
		const judgeFailure = new JudgeOutputValidationError({
			message: "invalid Judge output",
			prompt: "judge prompt",
			attempts: [],
			costUsd: 0,
		});
		const artifact = buildFailedJudgeRunArtifact(
			artifactBaseInputs(pipeline, AUDIT_LOG_PIPELINE_PATH),
			judgeFailure,
		);
		const abort = createRunAbort(
			{
				killActiveCommands: () => Promise.resolve(),
				registerSignal: () => undefined,
				releaseSignal: () => undefined,
				exit: () => undefined,
				reportError: () => undefined,
				persistence,
				runEvents,
			},
			{
				artifactFile,
				teardown: () => Promise.resolve(),
			},
		);

		await abort.writeFailedArtifact(artifact);
		await abort.markAborted("later failure");

		expect(runEvents.events.map(({ kind }) => kind)).toEqual(["run-failed"]);
	});

	it("writes the pending stage and failed run artifact without a Claude session", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-run-abort-"));
		testResources.track(directory);
		const artifactFile = join(directory, "run.json");
		const stageFile = join(directory, "shape.json");
		const pipeline = await loadDefaultPipeline();
		const artifact = buildRunArtifact(
			artifactInputs(pipeline, AUDIT_LOG_PIPELINE_PATH),
		);
		const abort = createRunAbort(
			{
				killActiveCommands: () => Promise.resolve(),
				registerSignal: () => undefined,
				releaseSignal: () => undefined,
				exit: () => undefined,
				reportError: () => undefined,
				persistence: fileRunArtifactPersistence,
			},
			{
				artifactFile,
				teardown: () => Promise.resolve(),
			},
		);
		const pendingStage: PendingStage = {
			file: stageFile,
			stage: "shape",
			input: stageJudgeInput("shape"),
		};

		abort.updatePendingStage(pendingStage);
		await abort.writePendingArtifact(artifact);
		await abort.markAborted("stage Judge failed");

		expect(JSON.parse(await Bun.file(stageFile).text())).toMatchObject({
			status: "STAGE_JUDGE_FAILED",
			stage: "shape",
			error: "stage Judge failed",
		});
		expect(JSON.parse(await Bun.file(artifactFile).text())).toEqual({
			...artifact,
			status: "FAILED",
		});
	});

	it("registers and releases the supported signal handlers", () => {
		const registered: {
			signal: NodeJS.Signals;
			handler: (signal: NodeJS.Signals) => void;
		}[] = [];
		const released: typeof registered = [];
		const abort = createRunAbort(
			{
				killActiveCommands: () => Promise.resolve(),
				registerSignal: (signal, handler) => {
					registered.push({ signal, handler });
				},
				releaseSignal: (signal, handler) => {
					released.push({ signal, handler });
				},
				exit: () => undefined,
				reportError: () => undefined,
				persistence: fileRunArtifactPersistence,
			},
			{
				artifactFile: "/tmp/run.json",
				teardown: () => Promise.resolve(),
			},
		);

		abort.release();

		expect(registered.map(({ signal }) => signal)).toEqual([
			"SIGINT",
			"SIGTERM",
			"SIGHUP",
		]);
		expect(released).toEqual(registered);
	});

	it("kills commands, records the interruption, restores, and exits with the signal code", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-run-signal-"));
		testResources.track(directory);
		const stageFile = join(directory, "shape.json");
		const effects: string[] = [];
		const handlers = new Map<
			NodeJS.Signals,
			(signal: NodeJS.Signals) => void
		>();
		const exited = Promise.withResolvers<number>();
		let evidencePresentAtTeardown = false;
		const abort = createRunAbort(
			{
				killActiveCommands: () => {
					effects.push("kill");

					return Promise.resolve();
				},
				registerSignal: (signal, handler) => {
					handlers.set(signal, handler);
				},
				releaseSignal: () => undefined,
				exit: (code) => {
					effects.push("exit");
					exited.resolve(code);
				},
				reportError: () => undefined,
				persistence: fileRunArtifactPersistence,
			},
			{
				artifactFile: join(directory, "run.json"),
				teardown: async () => {
					evidencePresentAtTeardown = await Bun.file(stageFile).exists();
					effects.push("teardown");
				},
			},
		);
		abort.updatePendingStage({
			file: stageFile,
			stage: "shape",
			input: stageJudgeInput("shape"),
		});

		handlers.get("SIGTERM")?.("SIGTERM");

		expect(effects).toEqual(["kill"]);
		expect(await exited.promise).toBe(143);
		expect(effects).toEqual(["kill", "teardown", "exit"]);
		expect(evidencePresentAtTeardown).toBe(true);
		expect(JSON.parse(await Bun.file(stageFile).text())).toMatchObject({
			status: "STAGE_JUDGE_FAILED",
			error: "run interrupted by SIGTERM",
		});
	});

	it("records evidence and restores when command cancellation fails", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-run-signal-"));
		testResources.track(directory);
		const stageFile = join(directory, "shape.json");
		const handlers = new Map<
			NodeJS.Signals,
			(signal: NodeJS.Signals) => void
		>();
		const exited = Promise.withResolvers<number>();
		let teardownCalls = 0;
		const abort = createRunAbort(
			{
				killActiveCommands: () => Promise.reject(new Error("kill failed")),
				registerSignal: (signal, handler) => {
					handlers.set(signal, handler);
				},
				releaseSignal: () => undefined,
				exit: exited.resolve,
				reportError: () => undefined,
				persistence: fileRunArtifactPersistence,
			},
			{
				artifactFile: join(directory, "run.json"),
				teardown: () => {
					teardownCalls += 1;

					return Promise.resolve();
				},
			},
		);
		abort.updatePendingStage({
			file: stageFile,
			stage: "shape",
			input: stageJudgeInput("shape"),
		});

		handlers.get("SIGTERM")?.("SIGTERM");
		await exited.promise;

		expect(teardownCalls).toBe(1);
		expect(JSON.parse(await Bun.file(stageFile).text())).toMatchObject({
			status: "STAGE_JUDGE_FAILED",
			error: "run interrupted by SIGTERM",
		});
	});

	it("records the failed run artifact when stage evidence cannot be written", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-run-abort-"));
		testResources.track(directory);
		const artifactFile = join(directory, "run.json");
		const pipeline = await loadDefaultPipeline();
		const artifact = buildRunArtifact(
			artifactInputs(pipeline, AUDIT_LOG_PIPELINE_PATH),
		);
		const abort = createRunAbort(
			{
				killActiveCommands: () => Promise.resolve(),
				registerSignal: () => undefined,
				releaseSignal: () => undefined,
				exit: () => undefined,
				reportError: () => undefined,
				persistence: fileRunArtifactPersistence,
			},
			{
				artifactFile,
				teardown: () => Promise.resolve(),
			},
		);
		abort.updatePendingStage({
			file: directory,
			stage: "shape",
			input: stageJudgeInput("shape"),
		});
		await abort.writePendingArtifact(artifact);

		await abort.markAborted("stage Judge failed");

		expect(JSON.parse(await Bun.file(artifactFile).text())).toEqual({
			...artifact,
			status: "FAILED",
		});
	});

	it("records only the first abort reason", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-run-abort-"));
		testResources.track(directory);
		const stageFile = join(directory, "shape.json");
		const abort = createRunAbort(
			{
				killActiveCommands: () => Promise.resolve(),
				registerSignal: () => undefined,
				releaseSignal: () => undefined,
				exit: () => undefined,
				reportError: () => undefined,
				persistence: fileRunArtifactPersistence,
			},
			{
				artifactFile: join(directory, "run.json"),
				teardown: () => Promise.resolve(),
			},
		);
		abort.updatePendingStage({
			file: stageFile,
			stage: "shape",
			input: stageJudgeInput("shape"),
		});

		await Promise.all([
			abort.markAborted("first reason"),
			abort.markAborted("second reason"),
		]);

		expect(JSON.parse(await Bun.file(stageFile).text())).toMatchObject({
			error: "first reason",
		});
	});

	it("restores once when cleanup callers overlap", async () => {
		const restored = Promise.withResolvers<undefined>();
		let teardownCalls = 0;
		const abort = createRunAbort(
			{
				killActiveCommands: () => Promise.resolve(),
				registerSignal: () => undefined,
				releaseSignal: () => undefined,
				exit: () => undefined,
				reportError: () => undefined,
				persistence: fileRunArtifactPersistence,
			},
			{
				artifactFile: "/tmp/run.json",
				teardown: () => {
					teardownCalls += 1;

					return restored.promise;
				},
			},
		);

		const first = abort.teardown();
		const second = abort.teardown();

		expect(teardownCalls).toBe(1);
		restored.resolve(undefined);
		await Promise.all([first, second]);
	});

	it("latches repeated signals while recovery is running", async () => {
		const cancellation = Promise.withResolvers<undefined>();
		const exited = Promise.withResolvers<undefined>();
		const handlers = new Map<
			NodeJS.Signals,
			(signal: NodeJS.Signals) => void
		>();
		let cancellationCalls = 0;
		let teardownCalls = 0;
		const exitCodes: number[] = [];
		createRunAbort(
			{
				killActiveCommands: () => {
					cancellationCalls += 1;

					return cancellation.promise;
				},
				registerSignal: (signal, handler) => {
					handlers.set(signal, handler);
				},
				releaseSignal: () => undefined,
				exit: (code) => {
					exitCodes.push(code);
					exited.resolve(undefined);
				},
				reportError: () => undefined,
				persistence: fileRunArtifactPersistence,
			},
			{
				artifactFile: "/tmp/run.json",
				teardown: () => {
					teardownCalls += 1;

					return Promise.resolve();
				},
			},
		);

		handlers.get("SIGINT")?.("SIGINT");
		handlers.get("SIGTERM")?.("SIGTERM");
		cancellation.resolve(undefined);
		await exited.promise;

		expect(cancellationCalls).toBe(1);
		expect(teardownCalls).toBe(1);
		expect(exitCodes).toEqual([130]);
	});
});
