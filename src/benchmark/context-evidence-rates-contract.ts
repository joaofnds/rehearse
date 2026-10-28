import { z } from "zod";

import type { Immutable } from "./contracts";

const RATE_CATALOG_SCHEMA_VERSION = 1;
const NO_TOKENS = 0;
const RATE_BASIS_TOKENS = 1_000_000;

const modelRateSchema = z
	.object({
		cacheReadUsdPerMillion: z.number().nonnegative(),
		cacheWrite1hUsdPerMillion: z.number().nonnegative(),
		cacheWrite5mUsdPerMillion: z.number().nonnegative(),
		inputUsdPerMillion: z.number().nonnegative(),
		model: z.string().nonempty(),
		outputUsdPerMillion: z.number().nonnegative(),
	})
	.strict();

/**
 * How much weight a rate carries. A corpus-measured rate is fitted to provider
 * charges in saved attempts. A tier-inferred one is computed from another
 * category by the published multiplier rather than fitted.
 */
const rateProvenanceSchema = z.enum([
	"corpus-measured",
	"publication-backed",
	"tier-inferred",
]);

const catalogProvenanceSchema = z
	.object({
		cacheReadUsdPerMillion: rateProvenanceSchema,
		cacheWrite1hUsdPerMillion: rateProvenanceSchema,
		cacheWrite5mUsdPerMillion: rateProvenanceSchema,
		inputUsdPerMillion: rateProvenanceSchema,
		outputUsdPerMillion: rateProvenanceSchema,
	})
	.strict();

const contextRateCatalogSchema = z
	.object({
		currency: z.literal("USD"),
		models: z.array(modelRateSchema),
		provenance: catalogProvenanceSchema,
		schemaVersion: z.literal(RATE_CATALOG_SCHEMA_VERSION),
		source: z.string().nonempty(),
		version: z.string().nonempty(),
	})
	.strict()
	.superRefine((catalog, context) => {
		const seen = new Set<string>();
		for (const [index, rate] of catalog.models.entries()) {
			if (seen.has(rate.model)) {
				context.addIssue({
					code: "custom",
					message: `duplicate rate for model ${rate.model}`,
					path: ["models", index, "model"],
				});
			}
			seen.add(rate.model);
		}
	});

type ContextRateCatalog = Immutable<z.infer<typeof contextRateCatalogSchema>>;

type ModelRate = Immutable<z.infer<typeof modelRateSchema>>;

interface PricedTokenUsage {
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly cacheReadTokens: number;
	readonly cacheWrite5mTokens: number;
	readonly cacheWrite1hTokens: number;
}

/**
 * A request that consumed nothing costs nothing under every rate, since
 * costFromRate is linear with no per-request constant. Pricing it without a
 * catalogued rate assumes no rate; reporting it unpriced would leave an
 * attempt's calculated cost permanently incomplete though nothing is missing
 * from the sum.
 */
function usageIsZero(usage: Readonly<PricedTokenUsage>): boolean {
	return (
		usage.inputTokens === NO_TOKENS &&
		usage.outputTokens === NO_TOKENS &&
		usage.cacheReadTokens === NO_TOKENS &&
		usage.cacheWrite5mTokens === NO_TOKENS &&
		usage.cacheWrite1hTokens === NO_TOKENS
	);
}

/**
 * One place where a rate category turns into money. Two projections price
 * requests, and a category added to the catalog but to only one of the sums
 * would undercharge silently rather than fail.
 */
function costFromRate(
	usage: Readonly<PricedTokenUsage>,
	rate: ModelRate,
): number {
	return (
		(usage.inputTokens * rate.inputUsdPerMillion +
			usage.outputTokens * rate.outputUsdPerMillion +
			usage.cacheReadTokens * rate.cacheReadUsdPerMillion +
			usage.cacheWrite5mTokens * rate.cacheWrite5mUsdPerMillion +
			usage.cacheWrite1hTokens * rate.cacheWrite1hUsdPerMillion) /
		RATE_BASIS_TOKENS
	);
}

export { contextRateCatalogSchema, usageIsZero, costFromRate, modelRateSchema };
export type { ContextRateCatalog, ModelRate, PricedTokenUsage };
