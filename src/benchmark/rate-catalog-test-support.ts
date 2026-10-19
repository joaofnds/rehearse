import type { ContextRateCatalog } from "./context-evidence-contract";

/**
 * A synthetic catalog's provenance says nothing, but the schema requires it.
 * Tests that care about provenance state it themselves; the rest take this.
 */
const syntheticRateProvenance: ContextRateCatalog["provenance"] = {
	cacheReadUsdPerMillion: "publication-backed",
	cacheWrite1hUsdPerMillion: "publication-backed",
	cacheWrite5mUsdPerMillion: "publication-backed",
	inputUsdPerMillion: "publication-backed",
	outputUsdPerMillion: "publication-backed",
};

export { syntheticRateProvenance as default };
