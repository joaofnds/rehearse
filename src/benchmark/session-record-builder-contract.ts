import type { z } from "zod";

import type { SessionCase } from "./case";
import type { HashedFile } from "./checkpoint";
import type { SessionSettings } from "./claude";
import type { reconcileManifest } from "./context-manifest";
import type { ResolvedCorpusFile } from "./corpus-file";
import type { CorpusMeasurement } from "./corpus-measurement";
import type { ReadManifestEntry } from "./read-manifest";
import type { SessionAttempt } from "./session-attempt";
import type {
	CorpusSnapshotOrigin,
	EXECUTION_FAILURE_SESSION_SCHEMA_VERSION,
	STATE_GRADING_SESSION_SCHEMA_VERSION,
	contextManifestSchema,
} from "./session-record-context-schema";

interface SessionAttemptRecordInputs {
	readonly sessionCase: SessionCase;
	readonly settings: SessionSettings;
	readonly spendCeilingUsd: number;
	readonly lineage: string;
	readonly corpusFiles: readonly ResolvedCorpusFile[];
	readonly corpusOrigin: CorpusSnapshotOrigin;
	readonly corpusVersion: CorpusMeasurement;
	/** The files `corpusVersion` holds. */
	readonly versionFiles: readonly HashedFile[];
	readonly attempt: SessionAttempt;
	/** The ISO instant the attempt's elapsed time starts, read from the wall clock. */
	readonly startedAt: string;
	readonly elapsedMs: number;
	readonly error?: string | undefined;
}

interface MutableSessionAttemptRecord {
	schemaVersion:
		| typeof EXECUTION_FAILURE_SESSION_SCHEMA_VERSION
		| typeof STATE_GRADING_SESSION_SCHEMA_VERSION;
	caseId: string;
	lineage: string;
	model: string;
	effort?: SessionSettings["effort"];
	sessionBudgetUsd: number;
	spendCeilingUsd: number;
	corpusDelivery: SessionAttempt["corpusDelivery"];
	corpusFiles: ResolvedCorpusFile[];
	corpusOrigin: CorpusSnapshotOrigin;
	corpusVersion?: CorpusMeasurement;
	settingsDigest?: string;
	setup: SessionAttempt["setup"];
	contextManifest?: z.infer<typeof contextManifestSchema>;
	divergences?: ReturnType<typeof reconcileManifest>;
	readManifest: ReadManifestEntry[];
	prompt: string;
	reply?: string;
	error?: string;
	transcriptFile: string;
	transcriptDiagnostics: SessionAttempt["transcriptDiagnostics"];
	unavailableSubagents?: string[];
	contextEvidence?: SessionAttempt["contextEvidence"];
	metrics?: SessionAttempt["metrics"];
	outcome: SessionAttempt["outcome"];
	checks: SessionAttempt["checks"];
	judge?: SessionAttempt["judge"];
	stateResults?: SessionAttempt["stateResults"];
	stateGradingError?: string;
	startedAt: string;
	elapsedMs: number;
}

export type { SessionAttemptRecordInputs, MutableSessionAttemptRecord };
