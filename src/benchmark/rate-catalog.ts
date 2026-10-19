import type { ContextRateCatalog } from "./context-evidence-contract";
import { contextRateCatalogSchema } from "./context-evidence-contract";

/**
 * Removing a rate here silently unprices every request that used it, and the
 * suite defends the four corpus-measured categories against drift. The 5m
 * cache-write figure is the exception: no saved attempt writes a 5m cache
 * entry, so it is computed as 1.25x the input rate, the published tier
 * multiplier, and no charge in the corpus confirms it. The 1h multiplier the
 * corpus does exercise holds at 2x for both models, so the ratio is plausible
 * rather than verified.
 */
const committedRateCatalog: ContextRateCatalog = contextRateCatalogSchema.parse(
	{
		currency: "USD",
		models: [
			{
				cacheReadUsdPerMillion: 0.2,
				cacheWrite1hUsdPerMillion: 4,
				cacheWrite5mUsdPerMillion: 2.5,
				inputUsdPerMillion: 2,
				model: "claude-sonnet-5",
				outputUsdPerMillion: 10,
			},
			{
				cacheReadUsdPerMillion: 0.5,
				cacheWrite1hUsdPerMillion: 10,
				cacheWrite5mUsdPerMillion: 6.25,
				inputUsdPerMillion: 5,
				model: "claude-opus-5",
				outputUsdPerMillion: 25,
			},
		],
		provenance: {
			cacheReadUsdPerMillion: "corpus-measured",
			cacheWrite1hUsdPerMillion: "corpus-measured",
			cacheWrite5mUsdPerMillion: "tier-inferred",
			inputUsdPerMillion: "corpus-measured",
			outputUsdPerMillion: "corpus-measured",
		},
		schemaVersion: 1,
		source: "corpus-fit-with-tier-inferred-5m",
		version: "2026-09-15",
	},
);

function rateFor(
	catalog: ContextRateCatalog,
	model: string,
): ContextRateCatalog["models"][number] | undefined {
	return catalog.models.find((rate) => rate.model === model);
}

export { committedRateCatalog, rateFor };
