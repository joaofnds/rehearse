import { randomUUID } from "node:crypto";
import type { SessionCase } from "#benchmark/case";
import type { Immutable } from "#benchmark/contracts";
import type { SessionSettings } from "#benchmark/claude";
import { runCommand } from "#benchmark/command";
import type { SessionRunConfig } from "#benchmark/config";
import { CLAUDE_TIMEOUT_MS } from "#benchmark/config";
import type { ResolvedCorpusFile } from "#benchmark/corpus-file";
import {
	CorpusConfigurationError,
	hashCorpusFiles,
} from "#benchmark/corpus-file";
import type { CorpusSourceResolver } from "#benchmark/corpus-source";
import { resolveCorpusSource } from "#benchmark/corpus-source";
import { SymlinkedEntryError } from "#benchmark/file-presence";
import type {
	ClaudeRunner,
	SessionAttempt,
	SessionAttemptRequest,
} from "#benchmark/session-attempt";
import {
	runSessionAttempt,
	SessionInputError,
} from "#benchmark/session-attempt";
import { SessionInvocationError } from "#benchmark/session-invocation-error";
import type { SessionCorpusSnapshot } from "#benchmark/session-corpus";
import { snapshotSessionCorpus } from "#benchmark/session-corpus";
import { sessionAttemptPaths } from "#benchmark/run-layout";
import { claudeProjectsDirectory } from "#benchmark/session-capture";
import { sessionLineage } from "#benchmark/session-lineage";
import type { SessionConfirmationRepPlan } from "#benchmark/session-confirmation";
import type { SessionAttemptRecord } from "#benchmark/session-record";
import { buildSessionAttemptRecord } from "#benchmark/session-record";
import { UsageError } from "#cli/commands";
import { claimShortId } from "#benchmark/short-id";
import { corpusRefusal } from "#cli/corpus-failures";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import type { CommandOutput } from "#cli/output";
import type {
	ContextEvidenceSource,
	ContextRateCatalog,
} from "#benchmark/context-evidence";

export const runClaudeCommand: ClaudeRunner = (command, cwd) =>
	runCommand(command, cwd, { timeoutMs: CLAUDE_TIMEOUT_MS });

export interface SessionRunRequest {
	readonly sessionCase: SessionCase;
	readonly config: SessionRunConfig;
	readonly runsDirectory: string;
	readonly runClaude: ClaudeRunner;
	readonly projectsDirectory: string;
	readonly resolveCorpus?: CorpusSourceResolver | undefined;
	readonly contextEvidenceSource?: ContextEvidenceSource | undefined;
	readonly contextRateCatalog?: ContextRateCatalog | undefined;
}

function settingsOf(config: SessionRunConfig): SessionSettings {
	return {
		model: config.model,
		effort: config.effort,
		budgetUsd: config.sessionBudgetUsd,
	};
}

interface AttemptCorpus {
	readonly snapshot: SessionCorpusSnapshot;
	readonly files: readonly ResolvedCorpusFile[];
}

/**
 * A `--corpus` string the parser cannot turn into a corpus is an unparseable
 * flag value, which is a usage error; a corpus that resolves but holds no
 * declared file, or holds one the harness cannot deliver, is a declared input
 * the command cannot satisfy, which is a refused precondition. Both come before
 * the attempt runs, so neither is discovered after the session is paid for.
 */
async function requireCorpus(
	sessionCase: SessionCase,
	corpus: string | undefined,
	snapshotDirectory: string,
	resolveCorpus: CorpusSourceResolver = resolveCorpusSource,
): Promise<AttemptCorpus> {
	let source;
	try {
		source = await resolveCorpus(corpus);
	} catch (error) {
		if (error instanceof CorpusConfigurationError) {
			const refusal = corpusRefusal(error);
			if (refusal !== undefined) {
				throw refusal;
			}
		}

		throw new UsageError(
			error instanceof Error ? error.message : String(error),
		);
	}

	try {
		const snapshot = await snapshotSessionCorpus(
			source,
			snapshotDirectory,
			sessionCase.corpusFiles,
		);

		return {
			snapshot,
			files: await hashCorpusFiles(snapshot, sessionCase.corpusFiles),
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

/**
 * The fixture tree is hashed into the lineage before the attempt seeds it, so
 * a tree the harness would refuse to seed is refused here first. Without this
 * translation the earlier walk would surface a raw error where the later copy
 * gives a named refusal, and which one a case author saw would depend on
 * nothing they can see.
 */
async function lineageOf(
	sessionCase: SessionCase,
	corpusFiles: readonly ResolvedCorpusFile[],
	settings: SessionSettings,
): Promise<string> {
	try {
		return await sessionLineage(sessionCase, corpusFiles, settings);
	} catch (error) {
		if (error instanceof SymlinkedEntryError) {
			throw new RefusedPreconditionError(error.message);
		}

		throw error;
	}
}

/**
 * A fixture tree the harness refuses to seed, and a transcript prefix whose
 * bytes are not the ones the case declares, are declared inputs the command
 * cannot satisfy, the same shape of refusal as a corpus file that does not
 * resolve, so they exit 3 rather than as an execution failure.
 */
async function attempted(
	request: SessionAttemptRequest,
): Promise<SessionAttempt> {
	try {
		return await runSessionAttempt(request);
	} catch (error) {
		if (error instanceof SessionInputError) {
			throw new RefusedPreconditionError(error.message);
		}

		throw error;
	}
}

export interface SessionRunOutcome {
	readonly recordFile: string;
	readonly record: SessionAttemptRecord;
}

export async function runSessionDebugAttempt(
	request: SessionRunRequest,
): Promise<SessionRunOutcome> {
	const { sessionCase, config } = request;
	const settings = settingsOf(config);
	const attemptId = { caseId: sessionCase.declaration.id, uuid: randomUUID() };
	const attemptPaths = sessionAttemptPaths(request.runsDirectory, attemptId);
	const recordDirectory = attemptPaths.directory;
	const corpus = await requireCorpus(
		sessionCase,
		config.corpus,
		attemptPaths.corpusDirectory,
		request.resolveCorpus,
	);
	const corpusFiles = corpus.files;
	const lineage = await lineageOf(sessionCase, corpusFiles, settings);
	await claimShortId(request.runsDirectory, attemptId.caseId, {
		kind: "attempt:session",
		...attemptId,
	});

	const startedAt = Date.now();
	const { recordFile } = attemptPaths;
	const persist = async (
		attempt: Immutable<SessionAttempt>,
		error?: string,
	): Promise<SessionRunOutcome> => {
		const record = buildSessionAttemptRecord({
			sessionCase,
			settings,
			lineage,
			corpusFiles,
			corpusOrigin: corpus.snapshot.origin,
			attempt,
			elapsedMs: Date.now() - startedAt,
			error,
		});
		await Bun.write(recordFile, `${JSON.stringify(record, null, 2)}\n`);

		return { recordFile, record };
	};

	let attempt: SessionAttempt;
	try {
		attempt = await attempted({
			sessionCase,
			settings,
			projectsDirectory: request.projectsDirectory,
			recordDirectory,
			runClaude: request.runClaude,
			corpusSnapshot: corpus.snapshot,
			contextEvidenceSource: request.contextEvidenceSource,
			contextRateCatalog: request.contextRateCatalog,
		});
	} catch (error) {
		if (!(error instanceof SessionInvocationError)) {
			throw error;
		}

		await persist(error.attempt, error.message);
		throw error;
	}

	return persist(attempt);
}

/**
 * Confirmation has already resolved and frozen every input shared by the
 * group. This seam runs only the provider attempt, placing its durable
 * transcript in the rep directory selected by the group adapter.
 */
export function runPreparedSessionAttempt(
	plan: Immutable<SessionConfirmationRepPlan>,
): Promise<SessionAttempt> {
	return attempted({
		sessionCase: plan.sessionCase,
		settings: plan.settings,
		projectsDirectory: claudeProjectsDirectory(),
		recordDirectory: plan.recordDirectory,
		runClaude: runClaudeCommand,
		corpusSnapshot: plan.corpusSnapshot,
	});
}

export function defaultSessionRunRequest(
	sessionCase: SessionCase,
	config: SessionRunConfig,
	runsDirectory: string,
): SessionRunRequest {
	return {
		sessionCase,
		config,
		runsDirectory,
		runClaude: runClaudeCommand,
		projectsDirectory: claudeProjectsDirectory(),
	};
}

export function reportSessionChecks(
	record: Immutable<SessionAttemptRecord>,
	output: CommandOutput,
): void {
	for (const check of record.checks) {
		output.stderr(`${check.status} ${check.kind}: ${check.detail}\n`);
	}
}
