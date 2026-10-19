import { costFromRate, usageIsZero } from "./context-evidence-contract";
import type {
	ContextEvidence,
	ContextRateCatalog,
} from "./context-evidence-contract";
import {
	numberValue,
	objectValue,
	stringValue,
} from "./context-evidence-values";
import type { JsonObject } from "./json-value";

const SINGLE_DISTINCT_VALUE_COUNT = 1;
const EMPTY_LOOKUP_SIZE = 0;
const EMPTY_COLLECTION_LENGTH = 0;
const TRANSCRIPT_MODEL_SOURCE_INDEX = 1;
const SINGLE_ITEM_COUNT = 1;

type TtlSplit =
	| {
			readonly state: "complete";
			readonly fiveMinuteTokens: number;
			readonly oneHourTokens: number;
	  }
	| { readonly state: "missing" }
	| { readonly state: "conflict" };

interface CacheWriteSplit {
	readonly fiveMinuteTokens: number;
	readonly oneHourTokens: number;
}
function cacheWriteSplit(
	row: Readonly<JsonObject>,
): CacheWriteSplit | undefined {
	const message = objectValue(row, "message");
	const usage = message && objectValue(message, "usage");
	const cache = usage && objectValue(usage, "cache_creation");
	if (cache === undefined) {
		return undefined;
	}
	const fiveMinuteTokens = numberValue(cache, "ephemeral_5m_input_tokens");
	const oneHourTokens = numberValue(cache, "ephemeral_1h_input_tokens");
	if (fiveMinuteTokens === undefined || oneHourTokens === undefined) {
		return undefined;
	}
	return { fiveMinuteTokens, oneHourTokens };
}
function resolvedTtlSplit(
	splits: ReadonlyMap<string, CacheWriteSplit>,
	missing: boolean,
): TtlSplit {
	if (splits.size > SINGLE_DISTINCT_VALUE_COUNT) {
		return { state: "conflict" };
	}
	if (missing || splits.size === EMPTY_LOOKUP_SIZE) {
		return { state: "missing" };
	}
	const [only] = splits.values();
	return only === undefined
		? { state: "missing" }
		: { state: "complete", ...only };
}
function ttlSplit(rows: readonly Readonly<JsonObject>[]): TtlSplit {
	const splits = new Map<string, CacheWriteSplit>();
	let missing = rows.length === EMPTY_COLLECTION_LENGTH;
	for (const row of rows) {
		const split = cacheWriteSplit(row);
		if (split === undefined) {
			missing = true;
		} else {
			splits.set(`${split.fiveMinuteTokens}:${split.oneHourTokens}`, split);
		}
	}
	return resolvedTtlSplit(splits, missing);
}

interface ModelEvidence {
	readonly model: string | null;
	readonly state: "complete" | "single-source" | "missing" | "conflict";
}

function requestModel(
	logs: readonly Readonly<JsonObject>[],
	transcripts: readonly Readonly<JsonObject>[],
	spans: readonly Readonly<JsonObject>[],
): ModelEvidence {
	const bySource = [logs, transcripts, spans].flatMap((rows, sourceIndex) => {
		const values = new Set<string>();
		for (const row of rows) {
			const container =
				sourceIndex === TRANSCRIPT_MODEL_SOURCE_INDEX
					? objectValue(row, "message")
					: objectValue(row, "attributes");
			const model = container && stringValue(container, "model");
			if (model !== undefined) {
				values.add(model);
			}
		}

		return values.size === EMPTY_LOOKUP_SIZE
			? []
			: [[sourceIndex, values] as const];
	});
	const models = new Set(bySource.flatMap(([, values]) => [...values]));
	if (
		models.size > SINGLE_DISTINCT_VALUE_COUNT ||
		bySource.some(([, values]) => values.size > SINGLE_DISTINCT_VALUE_COUNT)
	) {
		return { model: null, state: "conflict" };
	}
	const [model] = models;
	if (model === undefined) {
		return { model: null, state: "missing" };
	}

	return {
		model,
		state: bySource.length > SINGLE_ITEM_COUNT ? "complete" : "single-source",
	};
}

interface RequestUsageReading {
	readonly usageState: ContextEvidence["projection"]["requests"][number]["usageState"];
	readonly usage: ContextEvidence["projection"]["requests"][number]["usage"];
}

interface RequestModelReading {
	readonly modelState: ContextEvidence["projection"]["requests"][number]["modelState"];
	readonly model: string | null;
}

interface RequestPricingContext {
	readonly split: TtlSplit;
	readonly rates: ContextRateCatalog | undefined;
}

type Pricing = ContextEvidence["projection"]["requests"][number]["pricing"];
type CompleteUsage = NonNullable<RequestUsageReading["usage"]>;
interface RatedUsage {
	readonly usage: CompleteUsage;
	readonly model: string;
	readonly split: Extract<TtlSplit, { state: "complete" }>;
	readonly rates: ContextRateCatalog | undefined;
}
function ratedUsage({ usage, model, split, rates }: RatedUsage): Pricing {
	const pricedUsage = {
		cacheReadTokens: usage.cacheReadTokens,
		cacheWrite1hTokens: split.oneHourTokens,
		cacheWrite5mTokens: split.fiveMinuteTokens,
		inputTokens: usage.inputTokens,
		outputTokens: usage.outputTokens,
	};
	const rate = rates?.models.find((entry) => entry.model === model);
	if (rates === undefined || rate === undefined) {
		return usageIsZero(pricedUsage)
			? { calculatedCostUsd: 0, state: "zero-usage" }
			: { state: "rates-missing" };
	}
	return {
		calculatedCostUsd: costFromRate(pricedUsage, rate),
		currency: rates.currency,
		rateSource: rates.source,
		rateVersion: rates.version,
		selectedRate: rate,
		state: "complete",
	};
}
function priceCacheUsage(
	usage: CompleteUsage,
	model: string,
	{ split, rates }: RequestPricingContext,
): Pricing {
	if (split.state === "conflict") {
		return { state: "ttl-split-conflict" };
	}
	if (split.state === "missing") {
		return { state: "ttl-split-missing" };
	}
	if (split.fiveMinuteTokens + split.oneHourTokens !== usage.cacheWriteTokens) {
		return { state: "ttl-split-conflict" };
	}
	return ratedUsage({ model, rates, split, usage });
}
function priceModelUsage(
	usage: CompleteUsage,
	{ modelState, model }: RequestModelReading,
	context: RequestPricingContext,
): Pricing {
	if (modelState === "conflict") {
		return { state: "model-conflict" };
	}
	if (modelState === "missing" || model === null) {
		return { state: "model-missing" };
	}
	return priceCacheUsage(usage, model, context);
}
function requestPricing(
	{ usageState, usage }: RequestUsageReading,
	model: RequestModelReading,
	context: RequestPricingContext,
): Pricing {
	if (usageState === "conflict") {
		return { state: "usage-conflict" };
	}
	if (usageState !== "complete" || usage === undefined) {
		return { state: "usage-missing" };
	}
	return priceModelUsage(usage, model, context);
}

export { ttlSplit, requestModel, requestPricing };

export type { TtlSplit, ModelEvidence };
