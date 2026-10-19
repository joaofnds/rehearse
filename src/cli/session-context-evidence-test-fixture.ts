import {
	contextEvidenceSourceSchema,
	contextRateCatalogSchema,
} from "#benchmark/context-evidence";
import type { ContextRateCatalog } from "#benchmark/context-evidence-rates-contract";
import type { ContextEvidenceSource } from "#benchmark/context-evidence-source-contract";
import syntheticRateProvenance from "#benchmark/rate-catalog-test-support";

async function loadContextEvidenceSource(): Promise<ContextEvidenceSource> {
	return contextEvidenceSourceSchema.parse(
		await Bun.file(
			new URL(
				"../benchmark/__fixtures__/context-evidence-source.json",
				import.meta.url,
			),
		).json(),
	);
}
function syntheticContextCatalog(): ContextRateCatalog {
	return contextRateCatalogSchema.parse({
		currency: "USD",
		models: [
			{
				cacheReadUsdPerMillion: 0.3,
				cacheWrite1hUsdPerMillion: 6,
				cacheWrite5mUsdPerMillion: 3.75,
				inputUsdPerMillion: 3,
				model: "claude-sonnet-5",
				outputUsdPerMillion: 15,
			},
		],
		provenance: syntheticRateProvenance,
		schemaVersion: 1,
		source: "synthetic-rate-card",
		version: "2026-09-13",
	});
}
export { loadContextEvidenceSource, syntheticContextCatalog };
