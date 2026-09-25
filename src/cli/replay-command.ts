import type { CorpusRoot } from "#benchmark/corpus-file";
import { randomUUID } from "node:crypto";
import {
	loadAttempts,
	LineageMismatchError,
	presentAttempts,
} from "#benchmark/attempts";
import {
	assertPlanningStageCompleted,
	readTaskCard,
	readTaskOutput,
} from "#benchmark/backlog";
import {
	captureStageCorpus,
	materializeCheckpoint,
	stageCorpusRoots,
	installStageCorpusSnapshot,
} from "#benchmark/checkpoint";
import {
	captureBaselineContext,
	captureCheckIntegrity,
	captureFileHashes,
	captureTreatmentChecks,
} from "#benchmark/checks";
import { CaseDeclarationError, readCaseDeclaration } from "#benchmark/case";
import { runCommand } from "#benchmark/command";
import type { ReplayCliConfig } from "#benchmark/config";
import {
	CONTROL_DIR,
	judgeSelfPreferenceWarning,
	parseReplayArgs,
	parseReplayConfirmation,
	parseRunName,
	recordsDirectory,
} from "#benchmark/config";
import { loadRunManifest } from "#benchmark/manifest";
import { readCorpusInstructions } from "#benchmark/corpus-file";
import type { CorpusSourceResolver } from "#benchmark/corpus-source";
import { resolveCorpusSource } from "#benchmark/corpus-source";
import { measureCorpusVersion } from "#benchmark/corpus-version";
import { loadCurrentStageSettings } from "#benchmark/current-stage-settings";
import { runReplay } from "#benchmark/replay";
import { claudeProjectsDirectory } from "#benchmark/session-capture";
import type { ReplayDependencies, ReplayRequest } from "#benchmark/replay";
import type { ReplayStageOutcome } from "#benchmark/replay-command";
import { executeReplayStage } from "#benchmark/replay-command";
import type { ReplayConfirmationOutcome } from "#benchmark/replay-confirmation";
import { runReplayConfirmation } from "#benchmark/replay-confirmation";
import type { BenchmarkRunPaths } from "#benchmark/run-layout";
import { benchmarkRunPaths, recordedRunNames } from "#benchmark/run-layout";
import { loadStageRubric, runStageJudge } from "#benchmark/stage-grading";
import type { LoadedStageSettings } from "#benchmark/stage-settings";
import {
	addWorktree,
	assertBuildCommitted,
	captureBuildCandidate,
	changedPathsBetween,
	currentSha,
	git,
	removeWorktree,
} from "#benchmark/target";
import { createProductOwner, runWorkflowStage } from "#benchmark/workflow";
import { asUsageError } from "#cli/commands";
import { corpusRefusal } from "#cli/corpus-failures";
import {
	RefusedPreconditionError,
	requireInteractiveStdin,
	requireSpendAuthorization,
} from "#cli/interactive-stdin";
import type { CommandOutput } from "#cli/output";
import { diagnosticWriter, writeDiagnostic, writeRecord } from "#cli/output";
import { terminalQuestioner } from "#cli/questioner";

export interface ReplayEvidence {
	readonly recordPath: string;
	readonly lineage: string;
}

export type ReplayCommandOutcome = ReplayStageOutcome<
	ReplayEvidence,
	ReplayConfirmationOutcome
>;

export interface ReplayCommandRequest {
	readonly args: readonly string[];
	readonly json: boolean;
	readonly stdinIsTerminal: boolean;
}

export interface ReplayCommandDependencies {
	readonly output: CommandOutput;
	readonly resolveRunDirectory: (runName: string) => Promise<string>;
	readonly probeModel: (model: string) => Promise<void>;
	readonly execute: (
		config: ReplayCliConfig,
		paths: BenchmarkRunPaths,
		output: CommandOutput,
	) => Promise<ReplayCommandOutcome>;
}

export async function runReplayCommand(
	request: ReplayCommandRequest,
	dependencies: ReplayCommandDependencies,
): Promise<void> {
	const runName = asUsageError(() => parseRunName(request.args));
	const confirmation = asUsageError(() =>
		parseReplayConfirmation(request.args),
	);
	if (confirmation !== undefined && !confirmation.approved) {
		requireInteractiveStdin(
			request.stdinIsTerminal,
			"approving the projected cost needs a TTY; pass --yes instead",
		);
	}

	await dependencies.resolveRunDirectory(runName);
	const paths = benchmarkRunPaths(recordsDirectory(), runName);
	const declared = await declaredSessionKnobs(paths.manifestFile);
	const config = asUsageError(() =>
		parseReplayArgs(request.args, Bun.env, declared),
	);

	requireSpendAuthorization(request.args, Bun.env, request.stdinIsTerminal);

	writeDiagnostic(dependencies.output, judgeSelfPreferenceWarning(config));

	await dependencies.probeModel(config.model);

	const outcome = await dependencies.execute(
		config,
		paths,
		dependencies.output,
	);

	await reportOutcome(request, config, paths, outcome, dependencies.output);
}

/**
 * The model and budget the replayed run's case declares today, read before
 * the rest of replay's flags so they can stand in for --model and
 * --session-budget-usd. A case that no longer loads, renamed or deleted
 * since the run, leaves replay to the flags and environment alone rather
 * than refusing a replay those still cover.
 */
async function declaredSessionKnobs(manifestFile: string): Promise<{
	readonly model?: string | undefined;
	readonly sessionBudgetUsd?: number | undefined;
}> {
	try {
		const manifest = await loadRunManifest(manifestFile);
		const declaration = await readCaseDeclaration(manifest.caseId);

		return {
			model: declaration.model,
			sessionBudgetUsd: declaration.sessionBudgetUsd,
		};
	} catch (error) {
		if (error instanceof CaseDeclarationError) {
			return {};
		}

		throw error;
	}
}

/**
 * The settings file the replayed run's case declares today, the same path a
 * fresh run of that case would resolve. A case that no longer loads, renamed
 * or deleted since the run, or that is not a pipeline case, falls back to
 * the harness's own default rather than refusing the replay: the same
 * tolerance `declaredSessionKnobs` applies to model and budget.
 */
export async function replaySettingsFile(
	manifestFile: string,
): Promise<LoadedStageSettings> {
	const manifest = await loadRunManifest(manifestFile);

	return loadCurrentStageSettings(manifest.caseId);
}

/**
 * A replay's project-level corpus search is the target the replayed run
 * recorded, not the control repository: `replay.ts` already searches the
 * worktree it builds from that same source once one exists, so the
 * confirmation path's pre-worktree corpus freeze resolves the identical root
 * from the run's manifest.
 */
export async function replayCorpusRoots(
	manifestFile: string,
	source: CorpusRoot,
): Promise<readonly CorpusRoot[]> {
	const manifest = await loadRunManifest(manifestFile);

	return stageCorpusRoots(source, manifest.sourceRoot);
}

async function reportOutcome(
	request: ReplayCommandRequest,
	config: ReplayCliConfig,
	paths: BenchmarkRunPaths,
	outcome: ReplayCommandOutcome,
	output: CommandOutput,
): Promise<void> {
	if (outcome.kind === "confirmation") {
		output.stderr(`Confirmation group: ${outcome.evidence.groupRecordFile}\n`);
		for (const recordFile of outcome.evidence.repRecordFiles) {
			output.stderr(`Confirmation rep: ${recordFile}\n`);
		}
		await writeRecord(output, outcome.evidence.reportFile, request.json);

		return;
	}

	output.stderr(await attemptComparison(config, paths, outcome.evidence));
	await writeRecord(output, outcome.evidence.recordPath, request.json);
}

/**
 * The replay is already recorded and paid for, so a refusal to compare its
 * attempts is reported rather than thrown away with the command.
 */
async function attemptComparison(
	config: ReplayCliConfig,
	paths: BenchmarkRunPaths,
	evidence: ReplayEvidence,
): Promise<string> {
	try {
		return `${await presentAttempts(
			evidence.lineage,
			await loadAttempts(paths, config.stage, evidence.lineage),
		)}\n`;
	} catch (error) {
		if (!(error instanceof LineageMismatchError)) {
			throw error;
		}

		return `${error.message}\n`;
	}
}

/**
 * Replay exists to iterate on an uncommitted corpus, so a dirty control
 * repository is expected; the record marks it instead of refusing.
 */
async function currentControlSha(): Promise<string> {
	const sha = await git(CONTROL_DIR, "rev-parse", "HEAD");
	const status = await git(
		CONTROL_DIR,
		"status",
		"--porcelain=v1",
		"--untracked-files=all",
	);

	return status ? `${sha}-dirty` : sha;
}

export async function executeReplay(
	config: ReplayCliConfig,
	paths: BenchmarkRunPaths,
	output: CommandOutput,
): Promise<ReplayCommandOutcome> {
	const [corpus, loadedSettings] = await Promise.all([
		replayCorpus(config.corpus),
		replaySettingsFile(paths.manifestFile),
	]);
	const replayDependencies: ReplayDependencies = {
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
				measureCorpusVersion(paths.runsDirectory, corpus.source),
		},
		runStageJudge,
		loadStageRubric,
		addWorktree,
		removeWorktree,
		materializeCheckpoint,
		captureBaselineContext,
		captureFileHashes,
		currentSha,
		installDependencies: async (worktreeDir) => {
			await runCommand(["bun", "install", "--frozen-lockfile"], worktreeDir);
		},
		installStageCorpusSnapshot,
		projectsDirectory: claudeProjectsDirectory(),
		log: diagnosticWriter(output),
	};
	const replayRequest: ReplayRequest = {
		paths,
		stage: config.stage,
		instructions: corpus.instructions,
		corpusSource: corpus.source,
		settingSources: corpus.settingSources,
		loadedSettings,
		controlSha: await currentControlSha(),
		model: config.model,
		effort: config.effort,
		judgeModel: config.judgeModel,
		judgeEffort: config.judgeEffort,
		sessionBudgetUsd: config.sessionBudgetUsd,
	};
	const questioner = terminalQuestioner();

	try {
		return await executeReplayStage(config, replayRequest, {
			approval: {
				output: diagnosticWriter(output),
				prompt: (message) => questioner.question(message),
			},
			runDebug: async (debugRequest) => {
				const outcome = await runReplay(replayDependencies, debugRequest);

				return {
					recordPath: outcome.recordPath,
					lineage: outcome.record.consumed.lineage,
				};
			},
			runConfirmed: (confirmationRequest) =>
				runReplayConfirmation(replayDependencies, confirmationRequest),
			groupId: randomUUID,
			corpusRoots: await replayCorpusRoots(paths.manifestFile, corpus.source),
		});
	} finally {
		questioner.close();
	}
}

/**
 * A replay exists to iterate on a corpus, so a corpus source it is given is
 * both the instructions the stage reads and the reason the session is told to
 * prefer the project level. The live install needs neither, because a session
 * reads it by default.
 */
export async function replayCorpus(
	corpus: string | undefined,
	resolveCorpus: CorpusSourceResolver = resolveCorpusSource,
): Promise<{
	readonly instructions: string;
	readonly source: CorpusRoot;
	readonly settingSources: "project" | undefined;
}> {
	try {
		const source = await resolveCorpus(corpus);

		if (corpus === undefined) {
			return {
				instructions: await readCorpusInstructions(source),
				source,
				settingSources: undefined,
			};
		}

		return {
			instructions: await readCorpusInstructions(source),
			source,
			settingSources: "project",
		};
	} catch (error) {
		if (error instanceof Error) {
			const refusal = corpusRefusal(error);
			if (refusal !== undefined) {
				throw refusal;
			}
		}

		throw error;
	}
}

export async function resolveRunDirectory(runName: string): Promise<string> {
	const paths = benchmarkRunPaths(recordsDirectory(), runName);
	if (await Bun.file(paths.manifestFile).exists()) {
		return paths.checkpointsDirectory;
	}

	const recorded = await recordedRunNames(paths.runsDirectory);

	throw new RefusedPreconditionError(
		`No replayable run named ${paths.name}; recorded runs: ${
			recorded.join(", ") || "none"
		}`,
	);
}
