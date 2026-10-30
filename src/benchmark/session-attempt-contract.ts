import type { HashedFile } from "./checkpoint";
import type { ContextEvidence } from "./context-evidence";
import type { ContextManifest } from "./context-manifest";
import type { ClaudeCallMetrics, Immutable } from "./contracts";
import type { SessionAttemptRequest } from "./session-attempt-preparation-contract";
import type { CheckResult } from "./session-check";
import type { SessionSetupRecord } from "./session-setup";
import type { StateResult } from "./session-state-check";
import type { TranscriptDiagnostics, TranscriptLine } from "./transcript";

interface SessionAttempt {
	readonly attemptDirectory: string;
	readonly reply: string | undefined;
	readonly transcriptFile: string;
	readonly metrics: ClaudeCallMetrics | undefined;
	readonly outcome:
		| "SUCCESSFUL"
		| "UNSUCCESSFUL"
		| "NO_REPLY"
		| "EXECUTION_FAILED";
	readonly checks: readonly CheckResult[];
	readonly contextManifest: ContextManifest | undefined;
	/** The user's setup the session ran with, or that it declared isolation. */
	readonly setup: SessionSetupRecord;
	/**
	 * The declared project files the seeded fixture held, hashed before the
	 * session could write them. A declared file the fixture lacked is absent.
	 */
	readonly startingProjectFiles?: readonly HashedFile[] | undefined;
	/** Project instructions the session loaded, by their path in the target. */
	readonly loadedProjectInstructions?: readonly string[] | undefined;
	readonly transcriptDiagnostics: Immutable<TranscriptDiagnostics>;
	/**
	 * Agents an Agent or forked Skill result after the prefix names, whose
	 * transcript the provider did not leave. Absent on attempts recorded before
	 * sub-agent files were kept, which say nothing either way.
	 */
	readonly unavailableSubagents?: readonly string[] | undefined;
	readonly contextEvidence?: ContextEvidence | undefined;
	readonly stateEvidenceDirectory?: string | undefined;
	readonly stateResults?: readonly StateResult[] | undefined;
	readonly stateGradingError?: string | undefined;
}

interface AttemptOutput {
	readonly output: string;
	readonly setup: SessionSetupRecord;
	readonly writtenTranscript: string;
	readonly contextEvidence?: ContextEvidence | undefined;
	readonly installedCorpus: readonly string[];
}

interface PreservedTranscript {
	readonly file: string;
	readonly sourceAvailable: boolean;
	readonly lines: Immutable<readonly TranscriptLine[]>;
	readonly unavailableSubagents: readonly string[];
}

interface TranscriptRecord {
	readonly transcriptFile: string;
	readonly transcriptDiagnostics: Immutable<TranscriptDiagnostics>;
	readonly unavailableSubagents: readonly string[];
}

interface FailedInvocationEvidence {
	readonly attemptDirectory: string;
	readonly setup: SessionSetupRecord;
	readonly writtenTranscript: string;
	readonly error: Readonly<Error>;
}

interface InvocationFailureEvidence {
	readonly attemptDirectory: string;
	readonly setup: SessionSetupRecord;
	readonly recorded: TranscriptRecord;
}

interface InvocationFailureUsage {
	readonly metrics?: ClaudeCallMetrics | undefined;
	readonly contextEvidence?: ContextEvidence | undefined;
}

interface StateGrade {
	readonly stateResults?: readonly StateResult[] | undefined;
	readonly stateGradingError?: string | undefined;
}

interface AttemptCleanupFiles {
	readonly attemptDirectory: string;
	readonly slug: string;
	readonly transcriptPath: string;
	readonly recordDirectory: string;
}

type AttemptRecordBase = Omit<
	SessionAttempt,
	| "checks"
	| "contextManifest"
	| "outcome"
	| "metrics"
	| "stateEvidenceDirectory"
	| "stateResults"
	| "stateGradingError"
>;

interface CompletedAttemptEvidence {
	readonly request: SessionAttemptRequest;
	readonly attempt: AttemptOutput;
	readonly base: AttemptRecordBase;
	readonly turn: Immutable<readonly TranscriptLine[]>;
	readonly metrics: ClaudeCallMetrics | undefined;
	readonly stateEvidenceDirectory: string;
	readonly stateGrade: StateGrade;
}

export type {
	SessionAttempt,
	AttemptOutput,
	PreservedTranscript,
	TranscriptRecord,
	FailedInvocationEvidence,
	InvocationFailureEvidence,
	InvocationFailureUsage,
	StateGrade,
	CompletedAttemptEvidence,
	AttemptCleanupFiles,
};
