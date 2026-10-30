import { z } from "zod";

import {
	legacyConfirmationGroupRecordSchema,
	sessionConfirmationGroupRecordSchema,
} from "./confirmation-group-record-schema";
import { declaredCaseIdSchema } from "./confirmation-record-protocol";
import type { Immutable } from "./contracts";
import { parseRecord } from "./record-parse-cache";
import { startedAtSchema } from "./recorded-time";

const parsedConfirmationGroupRecordSchema = z.union([
	legacyConfirmationGroupRecordSchema,
	sessionConfirmationGroupRecordSchema,
]);

const confirmationGroupRecordSchema = legacyConfirmationGroupRecordSchema;

type ConfirmationGroupRecord = z.infer<
	typeof legacyConfirmationGroupRecordSchema
>;

type SessionConfirmationGroupRecord = z.infer<
	typeof sessionConfirmationGroupRecordSchema
>;

type ParsedConfirmationGroupRecord = z.infer<
	typeof parsedConfirmationGroupRecordSchema
>;

const groupStartedAtSchema = z
	.looseObject({ startedAt: startedAtSchema })
	.transform(({ startedAt }) => startedAt);

function parseConfirmationGroupRecord(
	text: string,
): Immutable<ParsedConfirmationGroupRecord> {
	return parseRecord(parsedConfirmationGroupRecordSchema, text);
}

interface DeclaredConfirmationGroup {
	readonly record: ParsedConfirmationGroupRecord;
	readonly declaredCaseId: string | undefined;
}

function parseDeclaredConfirmationGroup(
	text: string,
): DeclaredConfirmationGroup {
	const document: unknown = JSON.parse(text);
	const record = parsedConfirmationGroupRecordSchema.parse(document);
	const declared = declaredCaseIdSchema.safeParse(document);

	return { declaredCaseId: declared.data?.caseId, record };
}

export {
	confirmationGroupRecordSchema,
	groupStartedAtSchema,
	parseConfirmationGroupRecord,
	parseDeclaredConfirmationGroup,
};
export type {
	ConfirmationGroupRecord,
	SessionConfirmationGroupRecord,
	ParsedConfirmationGroupRecord,
	DeclaredConfirmationGroup,
};
export {
	MINIMUM_CONFIRMATION_REPS,
	PIPELINE_CONFIRMATION_SCHEMA_VERSION,
	SESSION_CONFIRMATION_SCHEMA_VERSION,
	confirmationModeSchema,
	isConfirmationIdentity,
} from "./confirmation-record-protocol";
export {
	sessionConfirmationRepRecordSchema,
	confirmationRepRecordSchema,
	parseConfirmationRepRecord,
} from "./confirmation-rep-record-schema";
export {
	sessionConfirmationGroupRecordSchema,
	writableConfirmationGroupRecordSchema,
	writableSessionConfirmationGroupRecordSchema,
} from "./confirmation-group-record-schema";
export type { ConfirmationMode } from "./confirmation-record-protocol";
export type { LiveCorpusRead } from "./live-corpus-reads";
export type {
	ConfirmationRepRecord,
	SessionConfirmationRepRecord,
	ParsedConfirmationRepRecord,
} from "./confirmation-rep-record-schema";
