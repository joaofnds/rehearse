import type { Immutable } from "./contracts";
import { parseRecord } from "./record-parse-cache";
import {
	sessionAttemptRecordSchema,
	sessionAttemptStateSchema,
} from "./session-record-schema";
import type {
	SessionAttemptRecord,
	SessionAttemptState,
} from "./session-record-schema";

function parseSessionAttemptState(
	text: string,
): Immutable<SessionAttemptState> {
	return parseRecord(sessionAttemptStateSchema, text);
}

function parseSessionAttemptRecord(
	text: string,
): Immutable<SessionAttemptRecord> {
	return parseRecord(sessionAttemptRecordSchema, text);
}

function attemptStartedAt(
	record: Immutable<SessionAttemptRecord>,
): string | undefined {
	return "startedAt" in record ? record.startedAt : undefined;
}

export {
	parseSessionAttemptState,
	parseSessionAttemptRecord,
	attemptStartedAt,
};
export {
	EXECUTION_FAILURE_SESSION_SCHEMA_VERSION,
	LEGACY_SESSION_SCHEMA_VERSION,
	STATE_GRADING_SESSION_SCHEMA_VERSION,
	corpusSnapshotOriginSchema,
	contextHalfSchema,
	manifestEntrySchema,
	contextManifestSchema,
	manifestDivergenceSchema,
	legacyManifestEntrySchema,
	legacyContextManifestSchema,
	legacyManifestDivergenceSchema,
} from "./session-record-context-schema";
export {
	legacyUntaggedSessionAttemptRecordSchema,
	legacyTaggedSessionAttemptRecordSchema,
	legacySessionAttemptRecordSchema,
	executionFailedSessionAttemptRecordSchema,
	sessionAttemptRecordV3Schema,
	sessionAttemptRecordSchema,
} from "./session-record-schema";
export { default as buildSessionAttemptRecord } from "./session-record-builder";
export type {
	CorpusSnapshotOrigin,
	ContextHalf,
} from "./session-record-context-schema";
export type {
	SessionAttemptState,
	LegacyUntaggedSessionAttemptRecord,
	LegacyTaggedSessionAttemptRecord,
	LegacySessionAttemptRecord,
	ExecutionFailedSessionAttemptRecord,
	SessionAttemptRecordV3,
	SessionAttemptRecord,
} from "./session-record-schema";
export type { SessionAttemptRecordInputs } from "./session-record-builder-contract";
