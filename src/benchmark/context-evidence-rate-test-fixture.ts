import { contextRateCatalogSchema } from "#benchmark/context-evidence";
import syntheticRateProvenance from "#benchmark/rate-catalog-test-support";

const sonnetRate = {
	cacheReadUsdPerMillion: 0.3,
	cacheWrite1hUsdPerMillion: 6,
	cacheWrite5mUsdPerMillion: 3.75,
	inputUsdPerMillion: 3,
	model: "claude-sonnet-5",
	outputUsdPerMillion: 15,
};

const haikuRate = {
	cacheReadUsdPerMillion: 0.1,
	cacheWrite1hUsdPerMillion: 2,
	cacheWrite5mUsdPerMillion: 1.25,
	inputUsdPerMillion: 1,
	model: "claude-haiku-5",
	outputUsdPerMillion: 5,
};

const rates = contextRateCatalogSchema.parse({
	currency: "USD",
	models: [sonnetRate, haikuRate],
	provenance: syntheticRateProvenance,
	schemaVersion: 1,
	source: "synthetic-rate-card",
	version: "2026-09-13",
});
export { sonnetRate, haikuRate, rates };
