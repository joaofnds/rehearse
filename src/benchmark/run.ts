import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { claudeProjectsDirectory } from "./session-capture";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	assertPlanningStageCompleted,
	seedTaskBoard,
	parseTaskState,
	readTaskCard,
	readTaskOutput,
} from "./backlog";
import type { FinalCandidate, Questioner } from "./calibration";
import { collectCalibration } from "./calibration";
import type {
	CheckpointInputs,
	CheckpointRecord,
	HashedFile,
	RootLineageInputs,
} from "./checkpoint";
import {
	captureStageCorpus,
	GLOBAL_SKILLS,
	hashArtifacts,
	hashWorkflowState,
	INITIAL_CHECKPOINT_STAGE,
	initialCheckpointInputs,
	recordCheckpoint,
	resolveSkillDirectory,
	stageCorpusRoots,
} from "./checkpoint";
import {
	captureBaselineContext,
	captureCheckIntegrity,
	captureFileHashes,
	captureTreatmentChecks,
	runChecks,
} from "./checks";
import { CommandError, killActiveCommands, runCommand } from "./command";
import type { BenchmarkCase } from "./case";
import type { BenchmarkConfig, Effort, WorkflowStage } from "./config";
import {
	CONTROL_DIR,
	DEFAULT_MINIMUM_STAGE_GRADE,
	recordsDirectory,
} from "./config";
import type { CorpusMeasurement } from "./corpus-measurement";
import { measureCorpusVersion, measuredCorpusFiles } from "./corpus-version";
import { RefusedPreconditionError } from "./exit-codes";
import type { CorpusRoot } from "./corpus-file";
import { liveCorpusSource, readCorpusInstructions } from "./corpus-file";
import type {
	CalibrationResult,
	ContextFile,
	FailedJudgeRunArtifact,
	GradedRunArtifact,
	LocalCheckResult,
	RunArtifactEvidence,
	StageJudgeInput,
	StageJudgeRecord,
	StageLetterGrade,
	StageScorecard,
	StageTranscript,
} from "./contracts";
import type { JudgeInvoker } from "./judge-attempt";
import {
	JudgeExecutionError,
	JudgeOutputValidationError,
} from "./judge-attempt";
import { JudgeCeilingStopError } from "./judge-ceiling-stop-error";
import type {
	JudgeAgreementCalibration,
	JudgeAgreementReport,
} from "./judge-agreement";
import { loadJudgeAgreementReport, stageRubricSha256 } from "./judge-agreement";
import type { JudgeResult } from "./judge";
import { runJudge, validateRubricDefinition } from "./judge";
import type { RunManifest } from "./manifest";
import { writeRunManifest } from "./manifest";
import type {
	PipelineDefinition,
	StageDefinition,
	TargetCheck,
	TargetDefinition,
} from "./pipeline";
import type {
	CeilingStop,
	CeilingStopReadings,
	PendingStage,
} from "./run-abort";
import { createRunAbort, fileRunArtifactPersistence } from "./run-abort";
import { corpusSourceDirectories, recordStageReads } from "./stage-reads";
import type { RunEventRecorder } from "./run-events";
import { openRunEventStore, runEventRecorderFor } from "./run-events";
import type { BenchmarkRunPaths } from "./run-layout";
import { pauseRequested, recordPaused } from "./run-pause";
import {
	benchmarkRunPaths,
	runEventsDatabaseFile,
	runNameFromTimestamp,
} from "./run-layout";
import {
	assertStageGradePassed,
	stageGradePassed,
	captureStageJudgeInput,
	loadStageRubric,
	runStageJudge,
} from "./stage-grading";
import type { LoadedStageSettings } from "./stage-settings";
import {
	assertBuildCommitted,
	assertControlReady,
	assertSourceReady,
	assertWorkspaceCleanAt,
	captureBuildCandidate,
	captureWorkflowBackup,
	changedPathsBetween,
	claimTarget,
	recordRetentionRef,
	teardownTarget,
} from "./target";
import type { SourceBaseline } from "./target";
import type { ProductOwner, ProductOwnerSnapshot } from "./workflow";
import { createProductOwner, runWorkflowStage } from "./workflow";
import { claimShortId, formatShortId } from "./short-id";
import type { SpendCeiling } from "./spend-ceiling";
import { createSpendCeiling, SpendCeilingReachedError } from "./spend-ceiling";

async function createRunFiles(timestamp: string): Promise<BenchmarkRunPaths> {
	const directory = recordsDirectory();

	await mkdir(directory, { recursive: true });

	return benchmarkRunPaths(directory, runNameFromTimestamp(timestamp));
}

export interface BuildEvidence {
	readonly resultSha: string;
	readonly diff: string;
	readonly changedPaths: readonly string[];
	readonly checkIntegrity: LocalCheckResult;
	readonly localChecks: LocalCheckResult;
	readonly taskState: string;
}

export interface RunArtifactBaseInputs {
	readonly timestamp: string;
	readonly controlSha: string;
	readonly source: {
		readonly root: string;
		readonly origin?: string | undefined;
		readonly sha: string;
	};
	readonly taskSha: string;
	readonly config: BenchmarkConfig;
	readonly pipeline: PipelineDefinition;
	readonly claudeVersion: string;
	readonly task: string;
	readonly productBrief: string;
	readonly instructions: string;
	readonly rubric: string;
	readonly rubricIds: readonly string[];
	readonly baselineContext: readonly ContextFile[];
	readonly taskId: string;
	readonly productOwner: ProductOwnerSnapshot;
	readonly workflow: readonly StageTranscript[];
	readonly stageScorecards: readonly StageScorecard[];
	readonly checkpoints: readonly CheckpointRecord[];
	readonly evidence: BuildEvidence;
	readonly elapsedMs?: number | undefined;
}

export interface RunArtifactInputs extends RunArtifactBaseInputs {
	readonly judge: JudgeResult;
	readonly reviewFile: string;
}

export interface RunManifestInputs {
	readonly timestamp: string;
	readonly controlSha: string;
	readonly source: SourceBaseline;
	readonly taskId: string;
	readonly taskSha: string;
	readonly task: string;
	readonly productBrief: string;
	readonly config: BenchmarkConfig;
	readonly pipeline: PipelineDefinition;
	readonly baselineChecks?: LocalCheckResult | undefined;
	readonly spendCeilingUsd: number;
}

export function buildRunManifest(inputs: RunManifestInputs): RunManifest {
	const { config, source } = inputs;

	return {
		caseId: config.caseId,
		timestamp: inputs.timestamp,
		controlSha: inputs.controlSha,
		sourceRoot: source.root,
		sourceSha: source.sha,
		taskId: inputs.taskId,
		taskSha: inputs.taskSha,
		task: inputs.task,
		productBrief: inputs.productBrief,
		model: config.model,
		effort: config.effort,
		judgeModel: config.judgeModel,
		judgeEffort: config.judgeEffort,
		sessionBudgetUsd: config.sessionBudgetUsd,
		pipelinePath: config.pipelinePath,
		pipeline: inputs.pipeline,
		baselineChecks: inputs.baselineChecks,
		minimumGrade: config.minimumStageGrade,
		spendCeilingUsd: inputs.spendCeilingUsd,
	};
}

function runArtifactEvidence(
	inputs: RunArtifactBaseInputs,
	judge: Pick<JudgeResult, "prompt" | "attempts" | "costUsd">,
): RunArtifactEvidence {
	const { source, config, evidence, productOwner } = inputs;

	return {
		caseId: config.caseId,
		timestamp: inputs.timestamp,
		controlSha: inputs.controlSha,
		sourceRoot: source.root,
		sourceOrigin: source.origin,
		sourceSha: source.sha,
		taskSha: inputs.taskSha,
		resultSha: evidence.resultSha,
		model: config.model,
		effort: config.effort,
		judgeModel: config.judgeModel,
		judgeEffort: config.judgeEffort,
		sessionBudgetUsd: config.sessionBudgetUsd,
		bunVersion: Bun.version,
		claudeVersion: inputs.claudeVersion.trim(),
		task: inputs.task,
		productBrief: inputs.productBrief,
		instructions: inputs.instructions,
		rubric: inputs.rubric,
		rubricIds: inputs.rubricIds,
		pipelinePath: config.pipelinePath,
		pipeline: inputs.pipeline,
		baselineContext: inputs.baselineContext,
		taskId: inputs.taskId,
		productOwnerSessionId: productOwner.sessionId,
		productOwnerCostUsd: productOwner.spentUsd,
		productOwnerProviderCalls: productOwner.providerCalls,
		workflow: inputs.workflow,
		stageScorecards: inputs.stageScorecards,
		checkpoints: inputs.checkpoints,
		taskState: evidence.taskState,
		judgePrompt: judge.prompt,
		judgeAttempts: judge.attempts,
		judgeCostUsd: judge.costUsd,
		diff: evidence.diff,
		changedPaths: evidence.changedPaths,
		checkIntegrity: evidence.checkIntegrity,
		localChecks: evidence.localChecks,
		elapsedMs: inputs.elapsedMs,
	};
}

export function buildRunArtifact(inputs: RunArtifactInputs): GradedRunArtifact {
	return {
		...runArtifactEvidence(inputs, inputs.judge),
		status: "AWAITING_HUMAN_REVIEW",
		grade: inputs.judge.grade,
		reviewFile: inputs.reviewFile,
	};
}

/**
 * The one transition that finishes a graded run's artifact. Generic over the
 * artifact so the command that completes a record it parsed back off disk
 * uses this rather than restating the status literal: a typo in "COMPLETE"
 * would type-check as a widened string and produce an artifact
 * `loadJudgeAgreementReport` skips forever without saying so.
 */
export function completeRunArtifact<T extends { readonly status: string }>(
	artifact: T,
	calibration: CalibrationResult,
	judgeAgreement: JudgeAgreementReport,
): T & CompletedRunArtifact {
	return {
		...artifact,
		status: "COMPLETE",
		calibration,
		judgeAgreement,
	};
}

interface CompletedRunArtifact {
	readonly status: "COMPLETE";
	readonly calibration: CalibrationResult;
	readonly judgeAgreement: JudgeAgreementReport;
}

export function buildFailedJudgeRunArtifact(
	inputs: RunArtifactBaseInputs,
	{ failure, ceilingStop }: Readonly<PaidJudgeFailure>,
): FailedJudgeRunArtifact {
	return {
		...runArtifactEvidence(inputs, failure),
		status: "FAILED",
		failure: failure.message,
		ceilingStop,
	};
}

type JudgeFailure =
	| JudgeOutputValidationError
	| JudgeCeilingStopError
	| JudgeExecutionError;

export interface PaidJudgeFailure {
	readonly failure: Readonly<JudgeFailure>;
	readonly ceilingStop: CeilingStopReadings | undefined;
}

/**
 * A Judge failure that still carries the attempts it paid for, with the
 * ceiling stop when the run's spend reached the ceiling. An execution
 * failure counts only at the ceiling, since its call was then halted at the
 * budget the ceiling had left.
 */
function paidJudgeFailure(
	error: Readonly<Error>,
	spendCeiling: SpendCeiling,
): PaidJudgeFailure | undefined {
	if (
		!(
			error instanceof JudgeOutputValidationError ||
			error instanceof JudgeCeilingStopError ||
			error instanceof JudgeExecutionError
		)
	) {
		return undefined;
	}
	const ceilingStop = ceilingReadings(
		error instanceof JudgeCeilingStopError ? error : undefined,
		spendCeiling,
	);
	if (error instanceof JudgeExecutionError && ceilingStop === undefined) {
		return undefined;
	}

	return { failure: error, ceilingStop };
}

export interface FinalJudgeRequest {
	readonly artifactInputs: RunArtifactBaseInputs;
	readonly writeFailedArtifact: (
		artifact: FailedJudgeRunArtifact,
	) => Promise<void>;
	readonly invoke?: JudgeInvoker | undefined;
	readonly elapsedMs?: (() => number) | undefined;
	readonly spendCeiling: SpendCeiling;
}

export async function runFinalJudge(
	request: FinalJudgeRequest,
): Promise<JudgeResult> {
	const { artifactInputs: inputs } = request;
	const { config, evidence } = inputs;

	try {
		return await runJudge(
			config.judgeModel,
			config.judgeEffort,
			{
				sessionBudgetUsd: config.sessionBudgetUsd,
				spendCeiling: request.spendCeiling,
			},
			inputs.rubric,
			inputs.baselineContext,
			evidence.diff,
			evidence.changedPaths,
			evidence.checkIntegrity,
			evidence.localChecks,
			request.invoke,
		);
	} catch (error) {
		const paid =
			error instanceof Error
				? paidJudgeFailure(error, request.spendCeiling)
				: undefined;
		if (paid !== undefined) {
			await request.writeFailedArtifact(
				buildFailedJudgeRunArtifact(
					{ ...inputs, elapsedMs: request.elapsedMs?.() },
					paid,
				),
			);
		}

		throw error;
	}
}

/**
 * Judges the run and builds its graded artifact, reading the run clock once
 * the judge returns so the run's elapsed time includes the judgment.
 */
export async function judgeRun(
	request: FinalJudgeRequest & { readonly reviewFile: string },
): Promise<GradedRunArtifact> {
	const judge = await runFinalJudge(request);

	return buildRunArtifact({
		...request.artifactInputs,
		judge,
		reviewFile: request.reviewFile,
		elapsedMs: request.elapsedMs?.(),
	});
}

export interface FinalCalibrationInput {
	readonly originalInstructions: string;
	readonly originalRubric: string;
	readonly finalRubricPath: string;
	readonly rubricsDirectory: string;
	readonly finalCandidate?: FinalCandidate | undefined;
	readonly stageScorecards: readonly StageScorecard[];
}

export interface FinishGradedRunRequest {
	readonly pause: boolean;
	readonly runName: string;
	readonly targetDir: string;
	readonly resultSha: string;
	readonly artifact: GradedRunArtifact;
	readonly calibrationInput: FinalCalibrationInput;
}

export interface FinishGradedRunDependencies {
	readonly recordRetentionRef: typeof recordRetentionRef;
	readonly collectCalibration: (
		input: FinalCalibrationInput,
	) => Promise<CalibrationResult>;
	readonly collectJudgeAgreement: (
		calibration: Readonly<CalibrationResult>,
	) => Promise<JudgeAgreementReport>;
	readonly completeArtifact: (artifact: GradedRunArtifact) => Promise<void>;
	readonly awaitArtifactReview: () => Promise<void>;
	readonly log: (message: string) => void;
}

/**
 * Whether a failed run stops for the reviewer before restoring. Only a paused
 * run may, and only when the stage-failure calibration has not already held
 * the target for the same purpose. A run without `--pause` skips the stop
 * rather than reaching it and recovering from a closed stdin, so nothing asks
 * a question nobody is there to answer.
 */
export function pausesOnFailure(
	pause: boolean,
	stageFailureCalibrated: boolean,
): boolean {
	return pause && !stageFailureCalibrated;
}

/**
 * The stop a failed run makes so the reviewer can inspect the target before it
 * is restored. It is best effort: a terminal that closed mid-run, on SIGHUP,
 * makes the prompt throw, and that error would otherwise propagate in place of
 * the failure that got the run here. The restore then proceeds either way,
 * because holding the target for a reviewer who is not there is the worse
 * outcome.
 */
export async function pauseForFailureInspection(
	rl: Questioner,
	targetDir: string,
	report: (message: string) => void,
): Promise<void> {
	try {
		await rl.question(
			`The run failed. Inspect ${targetDir} if useful, then press Enter to restore the target.`,
		);
	} catch {
		report("No interactive stdin; restoring the target now.");
	}
}

/**
 * What a run does once the final Judge has spoken, and the one place the two
 * paths differ. With `--pause` the reviewer is still holding the target, so
 * the run calibrates and completes the artifact. Without it the artifact stays
 * at AWAITING_HUMAN_REVIEW and the candidate is pinned under the run's
 * retention ref before the caller restores, because restoring makes the commit
 * unreachable and only the ref keeps gc from pruning it. `review` and
 * `calibrate` finish the record afterwards, from the frozen evidence.
 *
 * That artifact stops being pending before the restore begins. The restore is
 * seconds of git work with the signal handlers still registered, and an
 * artifact still pending is one an interrupt rewrites FAILED, which is a
 * status `calibrate` refuses to read.
 */
export async function finishGradedRun(
	request: Readonly<FinishGradedRunRequest>,
	dependencies: Readonly<FinishGradedRunDependencies>,
): Promise<void> {
	if (!request.pause) {
		await dependencies.awaitArtifactReview();
		await dependencies.recordRetentionRef(
			request.targetDir,
			request.runName,
			request.resultSha,
		);
		dependencies.log(
			`Candidate retained at refs/rehearse/${request.runName}; restoring the target. Record a review with \`rehearse review ${request.runName}\`, then \`rehearse calibrate ${request.runName}\`.`,
		);

		return;
	}

	const calibration = await dependencies.collectCalibration(
		request.calibrationInput,
	);
	const judgeAgreement = await dependencies.collectJudgeAgreement(calibration);
	await dependencies.completeArtifact(
		completeRunArtifact(request.artifact, calibration, judgeAgreement),
	);
	dependencies.log("Calibration recorded; restoring the target.");
}

/**
 * Records the checkpoint and then pins its commit under refs/rehearse, in
 * that order: an unpinned checkpoint is a gc race, a stray ref without a
 * checkpoint is only debris.
 */
export function retainedCheckpointRecorder(
	runName: string,
): typeof recordCheckpoint {
	return async (targetDir, directory, inputs) => {
		const record = await recordCheckpoint(targetDir, directory, inputs);
		await recordRetentionRef(targetDir, runName, inputs.targetSha);

		return record;
	};
}

export interface StageSessionDependencies {
	readonly runWorkflowStage: typeof runWorkflowStage;
	readonly readTaskOutput: typeof readTaskOutput;
	readonly readTaskCard: typeof readTaskCard;
	readonly captureBuildCandidate: typeof captureBuildCandidate;
	readonly assertPlanningStageCompleted: typeof assertPlanningStageCompleted;
	readonly assertBuildCommitted: typeof assertBuildCommitted;
	readonly changedPathsBetween: typeof changedPathsBetween;
	readonly captureCheckIntegrity: typeof captureCheckIntegrity;
	readonly captureTreatmentChecks: (
		targetDir: string,
		checks: readonly TargetCheck[],
	) => Promise<LocalCheckResult>;
	readonly captureStageCorpus: typeof captureStageCorpus;
	readonly measureCorpus: () => Promise<CorpusMeasurement>;
	readonly corpusVersionFiles: (
		measurement: CorpusMeasurement,
	) => Promise<readonly HashedFile[]>;
}

export interface StageDependencies extends StageSessionDependencies {
	readonly runStageJudge: typeof runStageJudge;
	readonly resolveSkillDirectory: typeof resolveSkillDirectory;
	readonly recordCheckpoint: typeof recordCheckpoint;
}

export interface StageContext {
	readonly corpusSource: CorpusRoot;
	readonly targetDir: string;
	readonly initialLineage: string;
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly judgeModel: string;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly spendCeiling: SpendCeiling;
	readonly minimumStageGrade?: StageLetterGrade | undefined;
	readonly productOwner: ProductOwner;
	readonly task: string;
	readonly productBrief: string;
	readonly instructions: string;
	readonly baselineContext: readonly ContextFile[];
	readonly baselineHashes: ReadonlyMap<string, string>;
	readonly taskId: string;
	readonly taskSha: string;
	readonly pipeline: PipelineDefinition;
	readonly loadedSettings: LoadedStageSettings;
	readonly stageFile: (stage: WorkflowStage) => string;
	readonly checkpointDirectory: (stage: WorkflowStage) => string;
	/**
	 * Where the provider writes session transcripts. Injected rather than read
	 * from the environment so a test can point it at a fixture, and optional so
	 * a caller that does not supply it records no transcript instead of
	 * guessing at the operator's home directory.
	 */
	readonly projectsDirectory?: string | undefined;
	readonly writePendingStage: (pending: PendingStage) => Promise<void>;
	readonly updatePendingStage: (pending: PendingStage) => void;
	readonly stopAtCeiling: (stop: CeilingStop) => void;
	readonly writeStageProgress: (record: StageJudgeRecord) => Promise<void>;
	readonly completeStage: (record: StageJudgeRecord) => Promise<void>;
	readonly calibrateStageFailure: (
		stageScorecards: readonly StageScorecard[],
	) => Promise<CalibrationResult | undefined>;
	readonly collectJudgeAgreement: (
		currentCalibrations: readonly JudgeAgreementCalibration[],
	) => Promise<JudgeAgreementReport>;
	readonly runEvents?: RunEventRecorder | undefined;
	readonly elapsedMs?: (() => number) | undefined;
	/**
	 * Whether the operator asked the run to pause after the stage now running.
	 * Asked once a stage's checkpoint is written and another stage remains.
	 */
	readonly pauseRequested?: (() => Promise<boolean>) | undefined;
}

/**
 * A run the operator paused: its last stage finished, was judged and wrote
 * its checkpoint, and no further stage starts. It is an ending of its own,
 * neither a failure nor a stop below the minimum grade.
 */
export class RunPausedError extends Error {
	public readonly stage: string;

	public constructor(stage: string) {
		super(`Run paused after the ${stage} stage, as the operator asked.`);
		this.name = "RunPausedError";
		this.stage = stage;
	}
}

export interface StageOutcome {
	readonly workflow: readonly StageTranscript[];
	readonly stageScorecards: readonly StageScorecard[];
	readonly checkpoints: readonly CheckpointRecord[];
	readonly buildEvidence?: BuildEvidence | undefined;
}

export interface StageSessionEnvironment {
	readonly targetDir: string;
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly spendCeiling: SpendCeiling;
	readonly productOwner: ProductOwner;
	readonly task: string;
	readonly productBrief: string;
	readonly instructions: string;
	readonly baselineContext: readonly ContextFile[];
	readonly baselineHashes: ReadonlyMap<string, string>;
	readonly target: TargetDefinition;
	readonly taskId: string;
	readonly taskSha: string;
	readonly baselineSha: string;
	readonly commitSubjectPattern?: string | undefined;
	readonly corpusRoots: readonly CorpusRoot[];
	readonly settingSources?: "project" | undefined;
	readonly settingsOverlay?: string | undefined;
	readonly runEvents?: RunEventRecorder | undefined;
	readonly elapsedMs?: (() => number) | undefined;
}

export interface StageSessionResult {
	readonly resultSha: string;
	readonly corpusFiles: readonly HashedFile[];
	readonly corpusVersion: CorpusMeasurement;
	/** The files `corpusVersion` holds, read before the session spends. */
	readonly versionFiles: readonly HashedFile[];
	readonly transcript: StageTranscript;
	readonly input: StageJudgeInput;
	readonly artifact?: ContextFile | undefined;
	readonly buildEvidence?: BuildEvidence | undefined;
}

/**
 * One stage session up to its judge-ready evidence: run the skill, read the
 * task state, and validate the stage's delivery. Shared by the run's stage
 * loop and by replay, which differ in what happens to the evidence, never in
 * how a stage produces it.
 */
export async function executeStageSession(
	dependencies: StageSessionDependencies,
	environment: StageSessionEnvironment,
	definition: StageDefinition,
	priorArtifacts: readonly ContextFile[],
): Promise<StageSessionResult> {
	const stage = definition.name;
	const corpusFiles = await dependencies.captureStageCorpus(
		definition.skill,
		environment.instructions,
		environment.corpusRoots,
	);
	const corpusVersion = await dependencies.measureCorpus();
	const versionFiles = await dependencies.corpusVersionFiles(corpusVersion);
	const transcript = await dependencies.runWorkflowStage({
		targetDir: environment.targetDir,
		model: environment.model,
		effort: environment.effort,
		sessionBudgetUsd: environment.sessionBudgetUsd,
		spendCeiling: environment.spendCeiling,
		productOwner: environment.productOwner,
		taskId: environment.taskId,
		stage,
		skill: definition.skill,
		settingSources: environment.settingSources,
		settingsOverlay: environment.settingsOverlay,
		runEvents: environment.runEvents,
		elapsedMs: environment.elapsedMs,
	});

	const currentTaskOutput = await dependencies.readTaskOutput(
		environment.targetDir,
		environment.taskId,
	);
	const taskCard = await dependencies.readTaskCard(
		environment.targetDir,
		environment.taskId,
	);
	const buildCandidate =
		definition.kind === "delivery"
			? await dependencies.captureBuildCandidate(
					environment.targetDir,
					environment.taskSha,
				)
			: undefined;
	const baseInput: StageJudgeInput = {
		stage,
		kind: definition.kind,
		task: environment.task,
		productBrief: environment.productBrief,
		instructions: environment.instructions,
		baselineContext: environment.baselineContext,
		taskState: taskCard,
		transcript,
		priorArtifacts: [...priorArtifacts],
		diff: buildCandidate?.diff,
		changedPaths: buildCandidate?.changedPaths,
	};
	let artifact: ContextFile | undefined;
	let buildEvidence: BuildEvidence | undefined;
	let resultSha = environment.baselineSha;
	const input = await captureStageJudgeInput(baseInput, async () => {
		if (definition.kind === "planning") {
			const currentTask = parseTaskState(currentTaskOutput);
			const planning = await dependencies.assertPlanningStageCompleted(
				environment.targetDir,
				environment.baselineSha,
				definition,
				currentTask,
			);
			({ artifact, resultSha } = planning);

			const planningInput: StageJudgeInput = {
				...baseInput,
				artifact: planning.artifact,
				diff: planning.changedPaths.length > 0 ? planning.diff : undefined,
				changedPaths:
					planning.changedPaths.length > 0 ? planning.changedPaths : undefined,
			};
			if (planning.commitSubjects !== undefined) {
				return {
					...planningInput,
					commitSubjects: planning.commitSubjects,
				};
			}

			return planningInput;
		}

		const build = await dependencies.assertBuildCommitted(
			environment.targetDir,
			environment.baselineSha,
			"main",
			environment.commitSubjectPattern,
		);
		({ resultSha } = build);
		buildEvidence = {
			resultSha: build.resultSha,
			diff: build.diff,
			changedPaths: await dependencies.changedPathsBetween(
				environment.targetDir,
				environment.baselineSha,
				build.resultSha,
			),
			checkIntegrity: await dependencies.captureCheckIntegrity(
				environment.targetDir,
				environment.baselineHashes,
			),
			localChecks: await dependencies.captureTreatmentChecks(
				environment.targetDir,
				environment.target.checks,
			),
			taskState: taskCard,
		};

		return {
			...baseInput,
			diff: buildEvidence.diff,
			changedPaths: buildEvidence.changedPaths,
			commitSubjects: build.commitSubjects,
			checkIntegrity: buildEvidence.checkIntegrity,
			localChecks: buildEvidence.localChecks,
		};
	});

	return {
		resultSha,
		corpusFiles,
		corpusVersion,
		versionFiles,
		transcript,
		input,
		artifact,
		buildEvidence,
	};
}

function stageElapsedMs(
	runElapsedMs: (() => number) | undefined,
	stageStartedAtMs: number | undefined,
): number | undefined {
	if (runElapsedMs === undefined || stageStartedAtMs === undefined) {
		return undefined;
	}

	return runElapsedMs() - stageStartedAtMs;
}

/** A refusal names the ceiling that refused, which for a rep may be its group's. */
function ceilingReadings(
	refusal: Readonly<SpendCeilingReachedError> | undefined,
	spendCeiling: SpendCeiling,
): CeilingStopReadings | undefined {
	if (refusal !== undefined) {
		return { ceilingUsd: refusal.ceilingUsd, spentUsd: refusal.spentUsd };
	}

	const spentUsd = spendCeiling.spentUsd();

	return spentUsd >= spendCeiling.ceilingUsd
		? { ceilingUsd: spendCeiling.ceilingUsd, spentUsd }
		: undefined;
}

/**
 * A paid call the ceiling refuses stops the run in the stage that made it,
 * so the stop is recorded against that stage before the refusal propagates.
 * A call that fails after spending to the ceiling stops it the same way,
 * since its budget was what the ceiling had left: a provider halts such a
 * call at that budget rather than returning a result.
 */
async function stoppingAtCeiling<Result>(
	context: Pick<StageContext, "spendCeiling" | "stageFile" | "stopAtCeiling">,
	stage: string,
	paid: () => Promise<Result>,
): Promise<Result> {
	try {
		return await paid();
	} catch (error) {
		const readings = ceilingReadings(
			error instanceof SpendCeilingReachedError ? error : undefined,
			context.spendCeiling,
		);
		if (readings !== undefined) {
			context.stopAtCeiling({
				file: context.stageFile(stage),
				stage,
				...readings,
			});
		}

		throw error;
	}
}

/**
 * Keeps the attempts a failed stage Judge paid for on the stage's pending
 * record, so the aborted stage artifact shows what the stage cost.
 */
function recordPaidStageJudgeFailure(
	context: Pick<StageContext, "spendCeiling" | "updatePendingStage">,
	readStage: PendingStage,
	error: Readonly<Error>,
): void {
	const paid = paidJudgeFailure(error, context.spendCeiling);
	if (paid === undefined) {
		return;
	}

	const { failure, ceilingStop } = paid;
	context.updatePendingStage({
		...readStage,
		failure: {
			prompt: failure.prompt,
			attempts: failure.attempts,
			costUsd: failure.costUsd,
		},
		ceilingStop,
	});
}

export async function runGradedStages(
	dependencies: StageDependencies,
	context: StageContext,
): Promise<StageOutcome> {
	const workflow: StageTranscript[] = [];
	const stageScorecards: StageScorecard[] = [];
	const stageArtifacts: ContextFile[] = [];
	const checkpoints: CheckpointRecord[] = [];
	let buildEvidence: BuildEvidence | undefined;

	// Every skill is resolved before any stage runs, so a missing one fails
	// the run before the first session is paid for. The global skills are
	// resolved too, because every stage's corpus hashes them. Hashing waits
	// for each stage's start: the lineage must record the corpus that fed the
	// stage, and a skill can change while earlier stages run.
	const corpusRoots = stageCorpusRoots(context.corpusSource, context.targetDir);
	for (const skill of [
		...GLOBAL_SKILLS,
		...context.pipeline.stages.map(({ skill: name }) => name),
	]) {
		await dependencies.resolveSkillDirectory(skill, corpusRoots);
	}
	let upstream = context.initialLineage;
	let baselineSha = context.taskSha;

	for (const definition of context.pipeline.stages) {
		const stage = definition.name;
		const stageStartedAtMs = context.elapsedMs?.();
		context.runEvents?.record(
			"stage-started",
			stage,
			workflow.reduce((total, transcript) => total + transcript.costUsd, 0),
			stageStartedAtMs ?? 0,
		);
		const sessionContext = {
			...context,
			target: context.pipeline.target,
			corpusRoots,
			baselineSha,
			commitSubjectPattern: context.pipeline.commitSubjectPattern,
			settingsOverlay: context.loadedSettings.json,
		};
		const session = await stoppingAtCeiling(context, stage, () =>
			executeStageSession(
				dependencies,
				sessionContext,
				definition,
				stageArtifacts,
			),
		);
		const { corpusFiles, corpusVersion, versionFiles, input } = session;
		workflow.push(session.transcript);
		if (session.artifact) {
			stageArtifacts.push(session.artifact);
		}
		if (session.buildEvidence) {
			({ buildEvidence } = session);
		}

		const stageFile = context.stageFile(stage);
		const pendingStage: PendingStage = {
			file: stageFile,
			stage,
			input,
			corpusFiles,
			corpusVersion,
			model: context.model,
			effort: context.effort,
			judgeModel: context.judgeModel,
			judgeEffort: context.judgeEffort,
			sessionBudgetUsd: context.sessionBudgetUsd,
		};
		await context.writePendingStage(pendingStage);
		const rubric = await loadStageRubric(definition);
		const stageTranscript =
			context.projectsDirectory === undefined
				? undefined
				: {
						sessionId: session.transcript.sessionId,
						projectsDirectory: context.projectsDirectory,
					};
		const readManifest = await recordStageReads({
			targetDir: context.targetDir,
			startSha: baselineSha,
			transcript: stageTranscript,
			skill: definition.skill,
			corpusSources: corpusSourceDirectories(context.corpusSource),
			corpusFiles,
			versionFiles,
			rubric: {
				path: definition.rubric,
				sha256: stageRubricSha256(rubric.rubric),
			},
		});
		const readStage: PendingStage = { ...pendingStage, readManifest };
		context.updatePendingStage(readStage);

		let scorecard: StageScorecard;
		try {
			scorecard = await stoppingAtCeiling(context, stage, () =>
				dependencies.runStageJudge(
					context.judgeModel,
					context.judgeEffort,
					{
						sessionBudgetUsd: context.sessionBudgetUsd,
						spendCeiling: context.spendCeiling,
					},
					input,
					rubric,
					undefined,
					(progress) => {
						context.runEvents?.recordJudgeProgress(
							stage,
							input.transcript.costUsd,
							context.elapsedMs?.() ?? 0,
							progress,
						);
					},
				),
			);
		} catch (error) {
			if (error instanceof Error) {
				recordPaidStageJudgeFailure(context, readStage, error);
			}

			throw error;
		}
		stageScorecards.push(scorecard);
		const elapsedMs = stageElapsedMs(context.elapsedMs, stageStartedAtMs);
		const stageRecord: StageJudgeRecord = {
			...scorecard,
			corpusFiles,
			corpusVersion,
			readManifest,
			model: context.model,
			judgeModel: context.judgeModel,
			judgeEffort: context.judgeEffort,
			sessionBudgetUsd: context.sessionBudgetUsd,
			effort: context.effort,
			elapsedMs,
		};
		const stops = !stageGradePassed(scorecard, context.minimumStageGrade);
		const writeStageRecord = stops
			? context.writeStageProgress
			: context.completeStage;
		await writeStageRecord(stageRecord);
		if (stops) {
			context.updatePendingStage({
				...readStage,
				scorecard,
				stopped: {
					minimumGrade:
						context.minimumStageGrade ?? DEFAULT_MINIMUM_STAGE_GRADE,
					elapsedMs,
					runElapsedMs: context.elapsedMs?.(),
					productOwner: context.productOwner.snapshot(),
				},
			});
			const calibration = await context.calibrateStageFailure(stageScorecards);
			if (calibration !== undefined) {
				const judgeAgreement = await context.collectJudgeAgreement([
					{
						judgeModel: context.judgeModel,
						humanReview: calibration.humanReview,
						stages: stageScorecards,
					},
				]);
				await context.completeStage({
					...stageRecord,
					calibration,
					judgeAgreement,
				});
			}
		}
		assertStageGradePassed(scorecard, context.minimumStageGrade);

		baselineSha = session.resultSha;
		const checkpoint = await dependencies.recordCheckpoint(
			context.targetDir,
			context.checkpointDirectory(stage),
			{
				stage,
				targetSha: session.resultSha,
				upstream,
				model: context.model,
				effort: context.effort,
				corpusFiles,
				corpusVersion,
				artifacts: hashArtifacts(input.artifact ? [input.artifact] : []),
				settingsFile: context.loadedSettings.hashed,
				transcript: stageTranscript,
				readManifest,
			},
		);
		checkpoints.push(checkpoint);
		upstream = checkpoint.lineage;
		const remaining = context.pipeline.stages.at(-1) !== definition;
		if (remaining && (await context.pauseRequested?.()) === true) {
			throw new RunPausedError(stage);
		}
	}

	return { workflow, stageScorecards, checkpoints, buildEvidence };
}

interface RunBaselineDependencies {
	readonly runChecks: (
		targetDir: string,
		label: string,
		checks: readonly TargetCheck[],
	) => Promise<void>;
	readonly assertWorkspaceCleanAt: typeof assertWorkspaceCleanAt;
	readonly captureFileHashes: typeof captureFileHashes;
	readonly captureBaselineContext: typeof captureBaselineContext;
}

interface RunBaseline {
	readonly baselineHashes: ReadonlyMap<string, string>;
	readonly baselineContext: readonly ContextFile[];
	readonly baselineChecks: LocalCheckResult;
}

export async function captureRunBaseline(
	dependencies: RunBaselineDependencies,
	source: SourceBaseline,
	target: TargetDefinition,
): Promise<RunBaseline> {
	try {
		await dependencies.runChecks(source.root, "Baseline checks", target.checks);
	} catch (error) {
		if (error instanceof CommandError) {
			throw new RefusedPreconditionError(
				`Baseline check failed (exit ${error.exitCode}): ${error.command.join(" ")}`,
			);
		}

		throw error;
	}
	const baselineChecks: LocalCheckResult = {
		status: "PASS",
		evidence: [
			{
				source: "local-checks",
				path: target.checks.map(({ command }) => command.join(" ")).join("; "),
				claim: "All baseline checks exited successfully",
			},
		],
	};
	await dependencies.assertWorkspaceCleanAt(source.root, source.sha);
	const baselineHashes = await dependencies.captureFileHashes(
		source.root,
		target.integrityFiles,
	);
	const baselineContext = await dependencies.captureBaselineContext(
		source.root,
	);

	return { baselineHashes, baselineContext, baselineChecks };
}

export function ordinaryInitialCheckpointInputs(
	root: RootLineageInputs,
	model: string,
	effort: Effort | undefined,
	loadedSettings: LoadedStageSettings,
): CheckpointInputs {
	return initialCheckpointInputs(root, model, effort, loadedSettings.hashed);
}

export async function runBenchmark(
	config: BenchmarkConfig,
	benchmarkCase: BenchmarkCase,
	loadedSettings: LoadedStageSettings,
	rl: Questioner,
	log: (message: string) => void,
	spendCeilingUsd: number,
): Promise<BenchmarkRunPaths> {
	const { pipeline } = benchmarkCase;
	const spendCeiling = createSpendCeiling({ ceilingUsd: spendCeilingUsd });
	const controlSha = await assertControlReady();
	const source = await assertSourceReady(config.sourceDir);
	const workflowBackup = await captureWorkflowBackup(source.root);
	const productOwnerDirectory = await mkdtemp(join(tmpdir(), "rehearse-po-"));
	const timestamp = new Date().toISOString();
	const runFiles = await createRunFiles(timestamp);
	let stageFailureCalibrated = false;
	const runEventStore = await openRunEventStore(
		runEventsDatabaseFile(runFiles.runsDirectory),
	);
	const runStartedAtMs = Date.now();
	const elapsedMs = (): number => Date.now() - runStartedAtMs;
	const runEvents = runEventRecorderFor(runEventStore, runFiles.name);
	const abort = createRunAbort(
		{
			killActiveCommands,
			registerSignal: (signal, handler) => {
				process.on(signal, handler);
			},
			releaseSignal: (signal, handler) => {
				process.off(signal, handler);
			},
			exit: (code) => process.exit(code),
			reportError: console.error,
			persistence: fileRunArtifactPersistence,
			runEvents,
			elapsedMs,
		},
		{
			artifactFile: runFiles.artifactFile,
			operatorStopFile: runFiles.operatorStopFile,
			teardown: () => teardownTarget(source, workflowBackup, log),
		},
	);

	try {
		await claimTarget(source);
	} catch (error) {
		runEventStore.close();
		abort.release();
		throw error;
	}

	try {
		log(`Target: ${source.root}`);
		log(`Original commit: ${source.sha}`);
		log(`Workflow backup: ${workflowBackup.directory}`);
		const { baselineHashes, baselineContext, baselineChecks } =
			await captureRunBaseline(
				{
					runChecks: (targetDir, label, checks) =>
						runChecks(targetDir, label, checks, log),
					assertWorkspaceCleanAt,
					captureFileHashes,
					captureBaselineContext,
				},
				source,
				pipeline.target,
			);
		const shortId = await claimShortId(runFiles.runsDirectory, config.caseId, {
			kind: "run",
			run: runFiles.name,
		});
		log(`Short id: ${formatShortId(shortId)}`);
		const { task, productBrief, finalRubric: rubric } = benchmarkCase;
		const corpusSource = liveCorpusSource();
		const [instructions, claudeVersion] = await Promise.all([
			readCorpusInstructions(corpusSource),
			runCommand(["claude", "--version"], CONTROL_DIR),
		]);
		const rubricIds = validateRubricDefinition(rubric);
		const { taskId, taskSha } = await seedTaskBoard(
			source.root,
			task,
			pipeline.statuses,
		);
		const recordRetainedCheckpoint = retainedCheckpointRecorder(runFiles.name);
		await writeRunManifest(
			runFiles.manifestFile,
			buildRunManifest({
				timestamp,
				controlSha,
				source,
				taskId,
				taskSha,
				task,
				productBrief,
				config,
				pipeline,
				baselineChecks,
				spendCeilingUsd,
			}),
		);
		const initialCheckpoint = await recordRetainedCheckpoint(
			source.root,
			runFiles.checkpointDirectory(INITIAL_CHECKPOINT_STAGE),
			ordinaryInitialCheckpointInputs(
				{
					taskSha,
					task,
					productBrief,
					workflowFiles: await hashWorkflowState(source.root),
				},
				config.model,
				config.effort,
				loadedSettings,
			),
		);
		const productOwner = createProductOwner({
			directory: productOwnerDirectory,
			model: config.model,
			effort: config.effort,
			sessionBudgetUsd: config.sessionBudgetUsd,
			spendCeiling,
			task,
			productBrief,
		});
		const { workflow, stageScorecards, checkpoints, buildEvidence } =
			await runGradedStages(
				{
					runWorkflowStage,
					runStageJudge,
					readTaskOutput,
					readTaskCard,
					captureBuildCandidate,
					assertPlanningStageCompleted,
					assertBuildCommitted,
					changedPathsBetween,
					captureCheckIntegrity,
					captureTreatmentChecks: (targetDir, checks) =>
						captureTreatmentChecks(targetDir, checks, log),
					resolveSkillDirectory,
					captureStageCorpus,
					measureCorpus: () =>
						measureCorpusVersion(runFiles.runsDirectory, corpusSource),
					corpusVersionFiles: (measurement) =>
						measuredCorpusFiles(runFiles.runsDirectory, measurement),
					recordCheckpoint: recordRetainedCheckpoint,
				},
				{
					targetDir: source.root,
					corpusSource,
					initialLineage: initialCheckpoint.lineage,
					model: config.model,
					effort: config.effort,
					judgeModel: config.judgeModel,
					judgeEffort: config.judgeEffort,
					sessionBudgetUsd: config.sessionBudgetUsd,
					spendCeiling,
					minimumStageGrade: config.minimumStageGrade,
					productOwner,
					task,
					productBrief,
					instructions,
					baselineContext,
					baselineHashes,
					taskId,
					taskSha,
					pipeline,
					loadedSettings,
					stageFile: runFiles.stageFile,
					checkpointDirectory: runFiles.checkpointDirectory,
					projectsDirectory: claudeProjectsDirectory(),
					writePendingStage: abort.writePendingStage,
					updatePendingStage: abort.updatePendingStage,
					writeStageProgress: abort.writeStageProgress,
					completeStage: abort.completeStage,
					stopAtCeiling: abort.stopAtCeiling,
					runEvents,
					elapsedMs,
					pauseRequested: () => pauseRequested(runFiles),
					calibrateStageFailure: async (scorecards) => {
						if (!config.pause) {
							return undefined;
						}

						const calibration = await collectCalibration({
							rl,
							reviewFile: runFiles.reviewFile,
							targetDir: source.root,
							originalInstructions: instructions,
							originalRubric: rubric,
							finalRubricPath: benchmarkCase.finalRubricPath,
							rubricsDirectory: benchmarkCase.rubricsDirectory,
							stageScorecards: scorecards,
							judgeModel: config.judgeModel,
							judgeEffort: config.judgeEffort,
							sessionBudgetUsd: config.sessionBudgetUsd,
							spendCeiling,
							log,
						});
						stageFailureCalibrated = true;

						return calibration;
					},
					collectJudgeAgreement: (currentCalibrations) =>
						loadJudgeAgreementReport(
							runFiles.runsDirectory,
							currentCalibrations,
						),
				},
			);

		if (!buildEvidence) {
			throw new Error("Build stage did not run");
		}
		// The build Judge saw only the delivery stage's own commits; the final
		// Judge grades the whole candidate, planning commits included.
		const fullCandidate = await captureBuildCandidate(source.root, taskSha);
		const evidence = {
			...buildEvidence,
			diff: fullCandidate.diff,
			changedPaths: fullCandidate.changedPaths,
		};

		const artifactInputs: RunArtifactBaseInputs = {
			timestamp,
			controlSha,
			source,
			taskSha,
			config,
			pipeline,
			claudeVersion,
			task,
			productBrief,
			instructions,
			rubric,
			rubricIds,
			baselineContext,
			taskId,
			productOwner: productOwner.snapshot(),
			workflow,
			stageScorecards,
			checkpoints: [initialCheckpoint, ...checkpoints],
			evidence,
		};

		log("\nJudge session");
		const artifact = await judgeRun({
			artifactInputs,
			writeFailedArtifact: abort.writeFailedArtifact,
			elapsedMs,
			spendCeiling,
			reviewFile: runFiles.reviewFile,
		});
		const { grade } = artifact;
		log(JSON.stringify(grade, null, 2));
		await abort.writePendingArtifact(artifact);
		log(`Run artifact: ${runFiles.artifactFile}`);
		if (config.pause) {
			log(`Human review: ${runFiles.reviewFile}`);
		}

		await finishGradedRun(
			{
				pause: config.pause,
				runName: runFiles.name,
				targetDir: source.root,
				resultSha: evidence.resultSha,
				artifact,
				calibrationInput: {
					originalInstructions: instructions,
					originalRubric: rubric,
					finalRubricPath: benchmarkCase.finalRubricPath,
					rubricsDirectory: benchmarkCase.rubricsDirectory,
					finalCandidate: {
						originalGrade: grade,
						baselineContext,
						diff: evidence.diff,
						changedPaths: evidence.changedPaths,
						checkIntegrity: evidence.checkIntegrity,
						localChecks: evidence.localChecks,
					},
					stageScorecards,
				},
			},
			{
				recordRetentionRef,
				collectCalibration: (input) =>
					collectCalibration({
						...input,
						rl,
						reviewFile: runFiles.reviewFile,
						targetDir: source.root,
						judgeModel: config.judgeModel,
						judgeEffort: config.judgeEffort,
						sessionBudgetUsd: config.sessionBudgetUsd,
						spendCeiling,
						log,
					}),
				collectJudgeAgreement: (calibration) =>
					loadJudgeAgreementReport(runFiles.runsDirectory, [
						{
							judgeModel: config.judgeModel,
							humanReview: calibration.humanReview,
							stages: stageScorecards,
							final: { rubric, grade },
						},
					]),
				completeArtifact: abort.completeArtifact,
				awaitArtifactReview: abort.awaitArtifactReview,
				log,
			},
		);

		return runFiles;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(message);
		if (error instanceof RunPausedError) {
			await recordPaused(runFiles, error.stage, new Date().toISOString());
			throw error;
		}
		await abort.markAborted(message);
		if (pausesOnFailure(config.pause, stageFailureCalibrated)) {
			await pauseForFailureInspection(rl, source.root, console.error);
		}
		throw error;
	} finally {
		try {
			await abort.teardown();
		} finally {
			abort.release();
			runEventStore.close();
			await rm(productOwnerDirectory, { force: true, recursive: true });
		}
	}
}
