import type { SessionCase } from "#benchmark/case";
import type { SessionRunConfig } from "#benchmark/config";
import type {
	ContextEvidenceSource,
	ContextRateCatalog,
} from "#benchmark/context-evidence";
import type { CorpusSourceResolver } from "#benchmark/corpus-source";
import type { measureCorpusVersion } from "#benchmark/corpus-version";
import type { ClaudeRunner } from "#benchmark/session-attempt";
import type { SessionAttemptRecord } from "#benchmark/session-record";

interface SessionRunRequest {
	readonly sessionCase: SessionCase;
	readonly config: SessionRunConfig;
	readonly spendCeilingUsd: number;
	readonly runsDirectory: string;
	readonly runClaude: ClaudeRunner;
	readonly projectsDirectory: string;
	readonly resolveCorpus?: CorpusSourceResolver | undefined;
	readonly contextEvidenceSource?: ContextEvidenceSource | undefined;
	readonly contextRateCatalog?: ContextRateCatalog | undefined;
	/** Epoch milliseconds a start time is read from; Date.now unless a test pins it. */
	readonly wallClock?: (() => number) | undefined;
	readonly now?: (() => number) | undefined;
	readonly measureCorpusVersion?: typeof measureCorpusVersion | undefined;
}

interface SessionRunOutcome {
	readonly recordFile: string;
	readonly record: SessionAttemptRecord;
}

export type { SessionRunOutcome, SessionRunRequest };
