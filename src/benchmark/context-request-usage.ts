import type { ContextEvidence } from "./context-evidence-contract";
import {
	canonicalJson,
	numberValue,
	objectValue,
} from "./context-evidence-values";
import type { TtlSplit } from "./context-request-pricing";
import type { JsonObject } from "./json-value";

const NO_RECORDED_LOG_ENTRIES = 0;
const SINGLE_DISTINCT_VALUE_COUNT = 1;
const SINGLE_ITEM_COUNT = 1;

function usageFrom(
	attributes: Readonly<JsonObject>,
): ContextEvidence["projection"]["requests"][number]["usage"] | undefined {
	const inputTokens = numberValue(attributes, "input_tokens");
	const outputTokens = numberValue(attributes, "output_tokens");
	const cacheReadTokens = numberValue(attributes, "cache_read_tokens");
	const cacheWriteTokens = numberValue(attributes, "cache_creation_tokens");
	if (
		inputTokens === undefined ||
		outputTokens === undefined ||
		cacheReadTokens === undefined ||
		cacheWriteTokens === undefined
	) {
		return undefined;
	}

	return { cacheReadTokens, cacheWriteTokens, inputTokens, outputTokens };
}

function transcriptUsageFrom(
	row: Readonly<JsonObject>,
): RequestUsage | undefined {
	const message = objectValue(row, "message");
	const usage = message && objectValue(message, "usage");
	if (usage === undefined) {
		return undefined;
	}
	return transcriptUsageValues(usage);
}

function transcriptUsageValues(
	usage: Readonly<JsonObject>,
): RequestUsage | undefined {
	const inputTokens = numberValue(usage, "input_tokens");
	const outputTokens = numberValue(usage, "output_tokens");
	const cacheReadTokens = numberValue(usage, "cache_read_input_tokens");
	const cacheWriteTokens = numberValue(usage, "cache_creation_input_tokens");
	if (
		inputTokens === undefined ||
		outputTokens === undefined ||
		cacheReadTokens === undefined ||
		cacheWriteTokens === undefined
	) {
		return undefined;
	}

	return { cacheReadTokens, cacheWriteTokens, inputTokens, outputTokens };
}

type RequestEvidence = ContextEvidence["projection"]["requests"][number];

type RequestUsage = NonNullable<RequestEvidence["usage"]>;

function usageWithSplit(
	baseUsage: RequestUsage | undefined,
	split: TtlSplit,
): RequestUsage | undefined {
	if (baseUsage === undefined) {
		return undefined;
	}
	const usage = { ...baseUsage };
	if (split.state === "complete") {
		Object.assign(usage, {
			cacheWrite1hTokens: split.oneHourTokens,
			cacheWrite5mTokens: split.fiveMinuteTokens,
		});
	}

	return usage;
}

type ResolvedRequestUsage =
	| {
			readonly state: "complete";
			readonly usage: RequestUsage;
			readonly route: NonNullable<RequestEvidence["usageRoute"]>;
	  }
	| {
			readonly state: "missing" | "partial" | "conflict";
			readonly usage?: undefined;
			readonly route?: undefined;
	  };

function transcriptUsages(
	transcriptRows: readonly Readonly<JsonObject>[],
): readonly RequestUsage[] {
	const byKey = new Map<string, RequestUsage>();
	for (const row of transcriptRows) {
		const usage = transcriptUsageFrom(row);
		if (usage !== undefined) {
			byKey.set(aggregateUsageKey(usage), usage);
		}
	}

	return [...byKey.values()];
}

interface UsageSourceCounts {
	readonly logCount: number;
	readonly distinctCount: number;
}

function transcriptOnlyUsage(
	logCount: number,
	usage: RequestUsage | undefined,
): ResolvedRequestUsage {
	if (logCount > NO_RECORDED_LOG_ENTRIES) {
		return { state: "partial" };
	}
	return usage === undefined
		? { state: "missing" }
		: { route: "transcript", state: "complete", usage };
}
function resolveRequestUsage(
	{ logCount, distinctCount }: UsageSourceCounts,
	otelUsage: RequestUsage | undefined,
	transcriptRows: readonly Readonly<JsonObject>[],
): ResolvedRequestUsage {
	const fromTranscript = transcriptUsages(transcriptRows);
	const [onlyTranscriptUsage] = fromTranscript;
	if (
		distinctCount > SINGLE_DISTINCT_VALUE_COUNT ||
		fromTranscript.length > SINGLE_ITEM_COUNT
	) {
		return { state: "conflict" };
	}
	if (otelUsage === undefined) {
		return transcriptOnlyUsage(logCount, onlyTranscriptUsage);
	}
	if (
		onlyTranscriptUsage !== undefined &&
		aggregateUsageKey(onlyTranscriptUsage) !== aggregateUsageKey(otelUsage)
	) {
		return { state: "conflict" };
	}
	return { route: "otel", state: "complete", usage: otelUsage };
}

function aggregateUsageKey(usage: Readonly<RequestUsage>): string {
	return canonicalJson({
		cacheReadTokens: usage.cacheReadTokens,
		cacheWriteTokens: usage.cacheWriteTokens,
		inputTokens: usage.inputTokens,
		outputTokens: usage.outputTokens,
	});
}

function uniqueRequestLogs(
	logs: readonly Readonly<JsonObject>[],
): readonly JsonObject[] {
	const unique = new Map<string, JsonObject>();
	for (const log of logs) {
		const attributes = objectValue(log, "attributes");
		if (attributes !== undefined) {
			const meteringAttributes: JsonObject = {};
			for (const [key, value] of Object.entries(attributes)) {
				if (key !== "request_id" && key !== "client_request_id") {
					meteringAttributes[key] = value;
				}
			}
			unique.set(canonicalJson(meteringAttributes), log);
		}
	}

	return [...unique.values()];
}

export { uniqueRequestLogs, usageFrom, resolveRequestUsage, usageWithSplit };
export type { RequestEvidence };
