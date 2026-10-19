import { z } from "zod";

import { modelRateSchema } from "./context-evidence-rates-contract";

const ZERO_USAGE_COST_USD = 0;

const tokenUsageSchema = z
	.object({
		cacheReadTokens: z.number().int().nonnegative(),
		cacheWrite1hTokens: z.number().int().nonnegative().optional(),
		cacheWrite5mTokens: z.number().int().nonnegative().optional(),
		cacheWriteTokens: z.number().int().nonnegative(),
		inputTokens: z.number().int().nonnegative(),
		outputTokens: z.number().int().nonnegative(),
	})
	.strict();

const completeRequestPricingSchema = z
	.object({
		calculatedCostUsd: z.number().nonnegative(),
		currency: z.literal("USD"),
		rateSource: z.string().nonempty(),
		rateVersion: z.string().nonempty(),
		selectedRate: modelRateSchema,
		state: z.literal("complete"),
	})
	.strict();

/**
 * The preconditions pricing can fail on. Two projections walk them, and a
 * state named in only one would let the same transcript report a different
 * gap depending on which reader asked.
 */
const UNPRICED_STATES = [
	"usage-missing",
	"usage-conflict",
	"model-missing",
	"model-conflict",
	"ttl-split-missing",
	"ttl-split-conflict",
	"rates-missing",
] as const;

type UnpricedState = (typeof UNPRICED_STATES)[number];

const UNPRICED_REASONS = {
	"model-conflict": "the executing model is in conflict",
	"model-missing": "the row names no model",
	"rates-missing": "no rate is catalogued for the executing model",
	"ttl-split-conflict": "the cache-write TTL split is in conflict",
	"ttl-split-missing": "the cache-write TTL split is missing",
	"usage-conflict": "usage is in conflict",
	"usage-missing": "the row carries no usage",
} satisfies Readonly<Record<UnpricedState, string>>;

const incompleteRequestPricingSchema = z
	.object({
		state: z.enum(UNPRICED_STATES),
	})
	.strict();

/**
 * Priced at zero with no rate behind it. Kept apart from "complete", which
 * requires the rate it was priced at, so a reading never claims a rate it
 * never selected.
 */
const zeroUsageRequestPricingSchema = z
	.object({
		calculatedCostUsd: z.literal(ZERO_USAGE_COST_USD),
		state: z.literal("zero-usage"),
	})
	.strict();

const requestPricingSchema = z.union([
	completeRequestPricingSchema,
	zeroUsageRequestPricingSchema,
	incompleteRequestPricingSchema,
]);

export {
	UNPRICED_STATES,
	UNPRICED_REASONS,
	tokenUsageSchema,
	requestPricingSchema,
};
export type { UnpricedState };
