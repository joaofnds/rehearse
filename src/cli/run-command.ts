import { randomUUID } from "node:crypto";
import {
	assertPlanningStageCompleted,
	seedTaskBoard,
	readTaskCard,
	readTaskOutput,
} from "#benchmark/backlog";
import { executeBenchmark } from "#benchmark/benchmark-command";
import {
	captureStageCorpus,
	installStageCorpusSnapshot,
	materializeCheckpoint,
	recordCheckpoint,
	corpusLayoutRoots,
} from "#benchmark/checkpoint";
import {
	captureBaselineContext,
	captureCheckIntegrity,
	captureFileHashes,
	captureTreatmentChecks,
	runChecks,
	runSetup,
} from "#benchmark/checks";
import type { BenchmarkCase, LoadedCase, SessionCase } from "#benchmark/case";
import { withPipeline } from "#benchmark/case";
import type {
	BenchmarkConfig,
	ConfirmationConfig,
	SessionRunConfig,
} from "#benchmark/config";
import type { Immutable } from "#benchmark/contracts";
import {
	judgeSelfPreferenceWarning,
	parseArgs,
	parseCaseId,
	parseSessionArgs,
	recordsDirectory,
} from "#benchmark/config";
import type { LiveCorpusRoot } from "#benchmark/corpus-file";
import {
	liveCorpusSource,
	readCorpusInstructions,
} from "#benchmark/corpus-file";
import { CorpusSourceError } from "#benchmark/corpus-source";
import {
	measureCorpusVersion,
	measuredCorpusFiles,
} from "#benchmark/corpus-version";
import { runJudge, validateRubricDefinition } from "#benchmark/judge";
import type {
	ModelPreflightEvidence,
	PipelinePreflightInputs,
} from "#benchmark/preflight";
import {
	asRefusedPrecondition,
	assertSystemPromptSnapshotSupported,
} from "#benchmark/preflight";
import type { PipelineConfirmationRequest } from "#benchmark/pipeline-confirmation";
import { runPipelineConfirmation } from "#benchmark/pipeline-confirmation";
import { claudeProjectsDirectory } from "#benchmark/session-capture";
import type {
	SessionConfirmationDependencies,
	SessionConfirmationRequest,
} from "#benchmark/session-confirmation";
import { runSessionConfirmation } from "#benchmark/session-confirmation";
import {
	projectConfirmationCost,
	runRequestedExecution,
} from "#benchmark/confirmation";
import { runBenchmark } from "#benchmark/run";
import { runStageJudge } from "#benchmark/stage-grading";
import type { LoadedStageSettings } from "#benchmark/stage-settings";
import {
	addWorktree,
	assertBuildCommitted,
	assertControlReady,
	assertSourceReady,
	captureBuildCandidate,
	changedPathsBetween,
	recordRetentionRef,
	removeWorktree,
} from "#benchmark/target";
import type { SourceBaseline } from "#benchmark/target";
import { createProductOwner, runWorkflowStage } from "#benchmark/workflow";
import { asUsageError, UsageError } from "#cli/commands";
import { corpusRefusal } from "#cli/corpus-failures";
import {
	refuseStageCorpus,
	requireInteractiveStdin,
	requireSpendAuthorization,
} from "#cli/interactive-stdin";
import type { CommandOutput } from "#cli/output";
import { diagnosticWriter, writeDiagnostic, writeRecord } from "#cli/output";
import { terminalQuestioner } from "#cli/questioner";
import {
	defaultSessionRunRequest,
	reportSessionChecks,
	runPreparedSessionAttempt,
	runSessionDebugAttempt,
} from "#cli/session-run-command";

const REVIEW_PAUSE_REASON =
	"--pause stops with the candidate in the target and waits for a reviewer, so it needs one; drop it and the run records its evidence, retains the candidate, and restores";

const COST_APPROVAL_REASON =
	"a confirmation group asks for its projected cost to be approved, so it needs one or --yes";

export interface RunCommandRequest {
	readonly args: readonly string[];
	readonly json: boolean;
	readonly stdinIsTerminal: boolean;
}

export type RunOutcome =
	| { readonly kind: "debug"; readonly recordFile: string }
	| { readonly kind: "confirmation"; readonly recordFile: string };

export interface RunCommandDependencies {
	readonly output: CommandOutput;
	readonly requireCase: (caseId: string) => Promise<LoadedCase>;
	readonly assertPreflight: (
		inputs: PipelinePreflightInputs,
	) => Promise<LoadedStageSettings>;
	readonly probeModel: (model: string) => Promise<ModelPreflightEvidence>;
	readonly execute: (
		config: BenchmarkConfig,
		output: CommandOutput,
		benchmarkCase: BenchmarkCase,
		loadedSettings: LoadedStageSettings,
	) => Promise<RunOutcome>;
	readonly executeSession: (
		config: SessionRunConfig,
		output: CommandOutput,
		sessionCase: SessionCase,
		boundary: SessionExecutionBoundary,
	) => Promise<RunOutcome>;
}

export interface SessionExecutionBoundary {
	readonly probeModel: RunCommandDependencies["probeModel"];
}

/**
 * The case is loaded before the configuration is resolved because it declares
 * both the pipeline the run executes and the target it falls back to, and
 * before the target is claimed because an unknown case must not leave one
 * dirty.
 */
export async function runRunCommand(
	request: RunCommandRequest,
	dependencies: RunCommandDependencies,
): Promise<void> {
	const caseId = asUsageError(() => parseCaseId(request.args));
	const loaded = await dependencies.requireCase(caseId);
	if (loaded.kind === "session") {
		await runSessionCase(loaded, request, dependencies);

		return;
	}

	const benchmarkCase = loaded;
	const config = asUsageError(() =>
		parseArgs(request.args, Bun.env, {
			caseId: benchmarkCase.declaration.id,
			pipelinePath: benchmarkCase.pipelinePath,
			targetPath: benchmarkCase.targetPath,
			model: benchmarkCase.declaration.model,
			sessionBudgetUsd: benchmarkCase.declaration.sessionBudgetUsd,
		}),
	);
	refuseStageCorpus(config.corpus);
	requireSpendAuthorization(request.args, Bun.env, request.stdinIsTerminal);
	refuseWithoutTerminal(config, request.stdinIsTerminal);

	writeDiagnostic(dependencies.output, judgeSelfPreferenceWarning(config));

	const selected = await asRefusedPrecondition(() =>
		selectedCase(benchmarkCase, config),
	);
	const loadedSettings = await dependencies.assertPreflight({
		sourceDir: config.sourceDir,
		settingsFilePath: selected.settingsFilePath,
		model: config.model,
	});

	const outcome = await dependencies.execute(
		config,
		dependencies.output,
		selected,
		loadedSettings,
	);

	await writeRecord(dependencies.output, outcome.recordFile, request.json);
}

/**
 * Two questions a run may ask, each refused before any paid work when nothing
 * can answer it: the review pause, requested by `--pause`, and the projected
 * cost of a confirmation group that `--yes` has not already approved.
 */
function refuseWithoutTerminal(
	config: Readonly<BenchmarkConfig>,
	stdinIsTerminal: boolean,
): void {
	if (config.pause) {
		requireInteractiveStdin(stdinIsTerminal, REVIEW_PAUSE_REASON);
	}
	requireConfirmationTerminal(config.confirmation, stdinIsTerminal);
}

function requireConfirmationTerminal(
	confirmation: Readonly<ConfirmationConfig> | undefined,
	stdinIsTerminal: boolean,
): void {
	if (confirmation !== undefined && !confirmation.approved) {
		requireInteractiveStdin(stdinIsTerminal, COST_APPROVAL_REASON);
	}
}

/**
 * A session case takes neither a target nor a pipeline, so it parses its own
 * configuration and skips the review pause the stage graph needs a TTY for:
 * a session attempt has no stage to pause between.
 */
async function runSessionCase(
	sessionCase: SessionCase,
	request: RunCommandRequest,
	dependencies: RunCommandDependencies,
): Promise<void> {
	const config = asUsageError(() =>
		parseSessionArgs(request.args, Bun.env, {
			caseId: sessionCase.declaration.id,
			model: sessionCase.declaration.model,
			sessionBudgetUsd: sessionCase.declaration.sessionBudgetUsd,
		}),
	);

	requireSpendAuthorization(request.args, Bun.env, request.stdinIsTerminal);
	requireConfirmationTerminal(config.confirmation, request.stdinIsTerminal);

	const outcome = await dependencies.executeSession(
		config,
		dependencies.output,
		sessionCase,
		{ probeModel: dependencies.probeModel },
	);

	await writeRecord(dependencies.output, outcome.recordFile, request.json);
}

/**
 * `--pipeline` overrides the case's declared pipeline, which changes the stage
 * rubrics with it, so the override is resolved into the loaded case rather
 * than carried alongside it.
 */
function selectedCase(
	benchmarkCase: BenchmarkCase,
	config: BenchmarkConfig,
): Promise<BenchmarkCase> {
	if (config.pipelinePath === benchmarkCase.pipelinePath) {
		return Promise.resolve(benchmarkCase);
	}

	return withPipeline(benchmarkCase, config.pipelinePath);
}

export async function executeRun(
	config: BenchmarkConfig,
	output: CommandOutput,
	benchmarkCase: BenchmarkCase,
	loadedSettings: LoadedStageSettings,
): Promise<RunOutcome> {
	const questioner = terminalQuestioner();

	try {
		const outcome = await executeBenchmark(
			config,
			benchmarkCase.pipeline.stages.length,
			{
				approval: {
					output: diagnosticWriter(output),
					prompt: (message) => questioner.question(message),
				},
				runDebug: () =>
					runBenchmark(
						config,
						benchmarkCase,
						loadedSettings,
						questioner,
						diagnosticWriter(output),
					),
				runConfirmed: (confirmation) =>
					confirmRun(
						config,
						benchmarkCase,
						loadedSettings,
						confirmation,
						output,
					),
			},
		);
		if (outcome.kind === "confirmation") {
			output.stderr(
				`Confirmation group: ${outcome.evidence.groupRecordFile}\n`,
			);
			for (const recordFile of outcome.evidence.repRecordFiles) {
				output.stderr(`Confirmation rep: ${recordFile}\n`);
			}

			return {
				kind: "confirmation",
				recordFile: outcome.evidence.reportFile,
			};
		}

		return { kind: "debug", recordFile: outcome.evidence.artifactFile };
	} finally {
		questioner.close();
	}
}

interface ConfirmationApproval {
	readonly reps: number;
	readonly projectedCost: PipelineConfirmationRequest["projectedCost"];
	readonly approvalMethod: "interactive" | "yes";
}

export interface ConfirmationRequestInputs {
	readonly corpusSource: LiveCorpusRoot;
	readonly benchmarkCase: BenchmarkCase;
	readonly config: BenchmarkConfig;
	readonly confirmation: ConfirmationApproval;
	readonly controlSha: string;
	readonly source: SourceBaseline;
	readonly instructions: string;
	readonly loadedSettings: LoadedStageSettings;
}

/**
 * The loaded case is the one owner of the case identity, so the group and rep
 * records name what the run actually loaded rather than a second copy of the
 * id that the configuration carries for the manifest.
 */
export function buildConfirmationRequest(
	inputs: Immutable<ConfirmationRequestInputs>,
): PipelineConfirmationRequest {
	const { benchmarkCase, config, confirmation } = inputs;

	return {
		runsDirectory: recordsDirectory(),
		groupId: randomUUID(),
		reps: confirmation.reps,
		projectedCost: confirmation.projectedCost,
		approvalMethod: confirmation.approvalMethod,
		source: inputs.source,
		controlSha: inputs.controlSha,
		caseId: benchmarkCase.declaration.id,
		pipelinePath: config.pipelinePath,
		pipeline: benchmarkCase.pipeline,
		task: benchmarkCase.task,
		productBrief: benchmarkCase.productBrief,
		instructions: inputs.instructions,
		finalRubric: benchmarkCase.finalRubric,
		stageRubrics: benchmarkCase.stageRubrics,
		corpusRoots: corpusLayoutRoots(inputs.source.root, inputs.corpusSource),
		model: config.model,
		effort: config.effort,
		judgeModel: config.judgeModel,
		judgeEffort: config.judgeEffort,
		sessionBudgetUsd: config.sessionBudgetUsd,
		loadedSettings: inputs.loadedSettings,
	};
}

async function confirmRun(
	config: BenchmarkConfig,
	benchmarkCase: BenchmarkCase,
	loadedSettings: LoadedStageSettings,
	confirmation: ConfirmationApproval,
	output: CommandOutput,
): Promise<Awaited<ReturnType<typeof runPipelineConfirmation>>> {
	const corpusSource = liveCorpusSource();
	const [controlSha, source, instructions] = await Promise.all([
		assertControlReady(),
		assertSourceReady(config.sourceDir),
		readCorpusInstructions(corpusSource),
	]);
	validateRubricDefinition(benchmarkCase.finalRubric);

	return runPipelineConfirmation(
		{
			createProductOwner,
			stageSession: {
				runWorkflowStage,
				readTaskOutput,
				readTaskCard,
				captureBuildCandidate,
				assertPlanningStageCompleted,
				assertBuildCommitted,
				changedPathsBetween,
				captureCheckIntegrity,
				captureTreatmentChecks: (targetDir, checks) =>
					captureTreatmentChecks(targetDir, checks, diagnosticWriter(output)),
				captureStageCorpus,
				measureCorpus: () =>
					measureCorpusVersion(recordsDirectory(), corpusSource),
				corpusVersionFiles: (measurement) =>
					measuredCorpusFiles(recordsDirectory(), measurement),
			},
			runStageJudge,
			runFinalJudge: (judgeRequest) =>
				runJudge(
					config.judgeModel,
					config.judgeEffort,
					config.sessionBudgetUsd,
					judgeRequest.rubric,
					judgeRequest.baselineContext,
					judgeRequest.evidence.diff,
					judgeRequest.evidence.changedPaths,
					judgeRequest.evidence.checkIntegrity,
					judgeRequest.evidence.localChecks,
				),
			seedTaskBoard,
			runChecks,
			runSetup,
			captureBaselineContext,
			captureFileHashes,
			addWorktree,
			removeWorktree,
			materializeCheckpoint,
			installStageCorpusSnapshot,
			recordCheckpoint,
			recordRetentionRef,
			captureBuildCandidate,
			projectsDirectory: claudeProjectsDirectory(),
			log: diagnosticWriter(output),
		},
		buildConfirmationRequest({
			benchmarkCase,
			config,
			confirmation,
			corpusSource,
			controlSha,
			source,
			instructions,
			loadedSettings,
		}),
	);
}

export interface SessionRunExecutionDependencies extends SessionExecutionBoundary {
	readonly assertSystemPromptSnapshotSupported?: typeof assertSystemPromptSnapshotSupported;
	readonly runDebug?: typeof runSessionDebugAttempt;
	readonly executeAttempt?: SessionConfirmationDependencies["executeAttempt"];
	readonly resolveCorpus?: SessionConfirmationDependencies["resolveCorpus"];
	readonly runsDirectory?: string;
}

export async function executeSessionRun(
	config: SessionRunConfig,
	output: CommandOutput,
	sessionCase: SessionCase,
	dependencies: SessionRunExecutionDependencies,
): Promise<RunOutcome> {
	if (sessionCase.declaration.transcript !== undefined) {
		await (
			dependencies.assertSystemPromptSnapshotSupported ??
			assertSystemPromptSnapshotSupported
		)();
	}

	const runsDirectory = dependencies.runsDirectory ?? recordsDirectory();
	const runDebug = dependencies.runDebug ?? runSessionDebugAttempt;
	const executeAttempt =
		dependencies.executeAttempt ?? runPreparedSessionAttempt;
	const questioner = terminalQuestioner();

	return runRequestedExecution<RunOutcome>({
		confirmation: config.confirmation,
		projectCost: () =>
			projectConfirmationCost({
				mode: "session",
				reps: config.confirmation?.reps ?? 1,
				sessionBudgetUsd: config.sessionBudgetUsd,
			}),
		approval: {
			output: diagnosticWriter(output),
			prompt: (message) => questioner.question(message),
		},
		runDebug: async () => {
			await dependencies.probeModel(config.model);
			const outcome = await runDebug({
				...defaultSessionRunRequest(sessionCase, config, runsDirectory),
				resolveCorpus: dependencies.resolveCorpus,
			});
			reportSessionChecks(outcome.record, output);

			return { kind: "debug", recordFile: outcome.recordFile };
		},
		runConfirmed: async (projectedCost) => {
			const preflight = await dependencies.probeModel(config.model);
			if (config.confirmation === undefined) {
				throw new Error(
					"Confirmed session execution requires confirmation config",
				);
			}
			if (projectedCost.preflightMaximumUsd === undefined) {
				throw new Error("Session projection requires a preflight maximum");
			}

			const request: SessionConfirmationRequest = {
				runsDirectory,
				groupId: randomUUID(),
				reps: config.confirmation.reps,
				projectedCost: {
					...projectedCost,
					preflightMaximumUsd: projectedCost.preflightMaximumUsd,
				},
				approvalMethod: config.confirmation.approved ? "yes" : "interactive",
				sessionCase,
				corpus: config.corpus,
				model: config.model,
				effort: config.effort,
				sessionBudgetUsd: config.sessionBudgetUsd,
				preflight,
			};
			let outcome;
			try {
				outcome = await runSessionConfirmation(
					{ executeAttempt, resolveCorpus: dependencies.resolveCorpus },
					request,
				);
			} catch (error) {
				if (error instanceof CorpusSourceError) {
					throw new UsageError(error.message);
				}
				if (error instanceof Error) {
					const refusal = corpusRefusal(error);
					if (refusal !== undefined) {
						throw refusal;
					}
				}

				throw error;
			}
			output.stderr(`Confirmation group: ${outcome.groupRecordFile}\n`);
			for (const recordFile of outcome.repRecordFiles) {
				output.stderr(`Confirmation rep: ${recordFile}\n`);
			}

			return { kind: "confirmation", recordFile: outcome.reportFile };
		},
	}).finally(() => {
		questioner.close();
	});
}
