import { z } from "zod";

import type { Immutable } from "./contracts";
import parseJsonDocument from "./json-document";
import { jsonValueSchema } from "./json-value";
import type { JsonValue } from "./json-value";
import type {
	SessionHistoryCacheWriteSplit,
	SessionHistoryRequestUsage,
} from "./session-history-request-contract";

const cacheCreationSchema = z.looseObject({
	ephemeral_1h_input_tokens: z.number().int().nonnegative(),
	ephemeral_5m_input_tokens: z.number().int().nonnegative(),
});

const requestUsageSchema = z.looseObject({
	cache_creation: jsonValueSchema.nullish(),
	cache_creation_input_tokens: z.number().int().nonnegative(),
	cache_read_input_tokens: z.number().int().nonnegative(),
	input_tokens: z.number().int().nonnegative(),
	output_tokens: z.number().int().nonnegative(),
});

const requestRowSchema = z.looseObject({
	message: z.looseObject({
		model: z.string().nonempty().optional(),
		stop_reason: z.string().nullable().optional(),
		usage: requestUsageSchema,
	}),
	requestId: z.string().nonempty().nullish(),
	type: z.literal("assistant"),
});

const compactionRowSchema = z
	.object({
		compactMetadata: z.object({ trigger: z.string().nonempty() }).loose(),
		subtype: z.literal("compact_boundary"),
		type: z.literal("system"),
	})
	.loose();

interface ParsedCompactionRow {
	readonly line: number;
	readonly trigger: string;
}

interface ParsedRequestRow {
	readonly requestId: string | undefined;
	readonly line: number;
	readonly model: string | undefined;
	readonly final: boolean;
	readonly usage: SessionHistoryRequestUsage;
	readonly cacheWriteSplit: SessionHistoryCacheWriteSplit;
}

const transcriptLineSchema = z.union([requestRowSchema, compactionRowSchema]);

const assistantRowSchema = z.looseObject({ type: z.literal("assistant") });

type DecodedTranscriptRow = Immutable<z.infer<typeof transcriptLineSchema>>;

/**
 * An unreadable line may hold a request the series cannot read: it is not
 * JSON, or it is an assistant row that fails the request schema.
 */
type TranscriptRowReading =
	| { readonly kind: "row"; readonly row: DecodedTranscriptRow }
	| { readonly kind: "unreadable" }
	| { readonly kind: "ignored" };

/**
 * Decodes only the two row kinds the series reads, then checks only the type
 * of a row neither accepts. Walking the whole line as generic JSON doubled the time to build a series from the largest saved
 * transcript, and validated nothing either reader needs.
 */
function transcriptRow(text: string): TranscriptRowReading {
	if (text.trim() === "") {
		return { kind: "ignored" };
	}

	const documentReading = parseJsonDocument(text, transcriptLineSchema);
	if (documentReading.kind === "invalid-json") {
		return { kind: "unreadable" };
	}

	const { parsed: row, value } = documentReading;
	if (row.success) {
		return { kind: "row", row: row.data };
	}

	return assistantRowSchema.safeParse(value).success
		? { kind: "unreadable" }
		: { kind: "ignored" };
}

function parsedCompactionRow(
	parsed: DecodedTranscriptRow,
	line: number,
): ParsedCompactionRow | undefined {
	const row = compactionRowSchema.safeParse(parsed);
	if (!row.success) {
		return undefined;
	}

	return { line, trigger: row.data.compactMetadata.trigger };
}

function parsedRequestRow(
	parsed: DecodedTranscriptRow,
	line: number,
): ParsedRequestRow | undefined {
	const row = requestRowSchema.safeParse(parsed);
	if (!row.success) {
		return undefined;
	}

	const { usage } = row.data.message;

	return {
		cacheWriteSplit: cacheWriteSplit(
			usage.cache_creation,
			usage.cache_creation_input_tokens,
		),
		final: row.data.message.stop_reason !== null,
		line,
		model: row.data.message.model,
		requestId: row.data.requestId ?? undefined,
		usage: {
			cacheReadTokens: usage.cache_read_input_tokens,
			cacheWriteTokens: usage.cache_creation_input_tokens,
			inputTokens: usage.input_tokens,
			outputTokens: usage.output_tokens,
		},
	};
}

/**
 * The split is what makes a cache write priceable: the 5m and 1h rates differ
 * per model and are not derivable from one another. A split that does not add
 * up to the cache-write total prices nothing, so it is a conflict rather than
 * a number to lean on.
 */
function cacheWriteSplit(
	reported: JsonValue | null | undefined,
	cacheWriteTokens: number,
): SessionHistoryCacheWriteSplit {
	if (reported === null || reported === undefined) {
		return {
			reasons: ["the row reports no cache-creation TTL split"],
			state: "missing",
		};
	}
	const parsed = cacheCreationSchema.safeParse(reported);
	if (!parsed.success) {
		return {
			reasons: ["the row's cache-creation TTL split is unreadable"],
			state: "missing",
		};
	}
	return checkedCacheWriteTotals(parsed.data, cacheWriteTokens);
}

function totalInputTokens(usage: Readonly<SessionHistoryRequestUsage>): number {
	return usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
}

function sameUsage(
	left: Readonly<SessionHistoryRequestUsage>,
	right: Readonly<SessionHistoryRequestUsage>,
): boolean {
	return (
		left.inputTokens === right.inputTokens &&
		left.outputTokens === right.outputTokens &&
		left.cacheReadTokens === right.cacheReadTokens &&
		left.cacheWriteTokens === right.cacheWriteTokens
	);
}

function checkedCacheWriteTotals(
	reported: Readonly<z.infer<typeof cacheCreationSchema>>,
	cacheWriteTokens: number,
): SessionHistoryCacheWriteSplit {
	const fiveMinuteTokens = reported.ephemeral_5m_input_tokens;
	const oneHourTokens = reported.ephemeral_1h_input_tokens;
	const total = fiveMinuteTokens + oneHourTokens;
	if (total !== cacheWriteTokens) {
		return {
			reasons: [
				`the TTL split totals ${total} against ${cacheWriteTokens} cache-write tokens`,
			],
			state: "conflict",
		};
	}

	return { fiveMinuteTokens, oneHourTokens, state: "complete" };
}

export {
	totalInputTokens,
	cacheWriteSplit,
	sameUsage,
	transcriptRow,
	parsedCompactionRow,
	parsedRequestRow,
};

export type { ParsedRequestRow, ParsedCompactionRow, DecodedTranscriptRow };
