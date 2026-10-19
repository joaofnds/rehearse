import { z } from "zod";

import projectionSchema from "./context-evidence-projection-contract";
import {
	contextRateCatalogSchema,
	costFromRate,
} from "./context-evidence-rates-contract";
import type { RequestRefinementContext } from "./context-evidence-request-contract";
import contextEvidenceSourceSchema from "./context-evidence-source-contract";
import type { Immutable } from "./contracts";

const CONTEXT_EVIDENCE_SCHEMA_VERSION = 1;
const PRICING_TOLERANCE_USD = 1e-12;

const evidencePayloadSchema = z
	.object({
		projection: projectionSchema,
		rateCatalog: contextRateCatalogSchema.optional(),
		schemaVersion: z.literal(CONTEXT_EVIDENCE_SCHEMA_VERSION),
		source: contextEvidenceSourceSchema,
	})
	.strict();

type EvidencePayload = z.infer<typeof evidencePayloadSchema>;

type EvidenceRequest = EvidencePayload["projection"]["requests"][number];

interface IndexedRefinement {
	readonly index: number;
	readonly context: Readonly<RequestRefinementContext>;
}

function refineCatalogReference(
	request: Immutable<EvidenceRequest>,
	evidence: Immutable<EvidencePayload>,
	{ index, context }: IndexedRefinement,
): void {
	if (request.pricing.state !== "complete") {
		return;
	}

	const catalog = evidence.rateCatalog;

	const selected = request.pricing.selectedRate;

	const catalogRate = catalog?.models.find(
		(rate) => rate.model === selected.model,
	);

	if (
		catalog === undefined ||
		catalog.source !== request.pricing.rateSource ||
		catalog.version !== request.pricing.rateVersion ||
		catalog.currency !== request.pricing.currency ||
		catalogRate === undefined ||
		JSON.stringify(catalogRate) !== JSON.stringify(selected)
	) {
		context.addIssue({
			code: "custom",
			message: "complete pricing must reference its persisted rate catalog",
			path: ["projection", "requests", index, "pricing"],
		});
	}
}

function refineCalculatedCost(
	request: Immutable<EvidenceRequest>,
	{ index, context }: IndexedRefinement,
): void {
	if (request.pricing.state !== "complete") {
		return;
	}
	const selected = request.pricing.selectedRate;

	const { usage } = request;

	if (
		usage?.cacheWrite5mTokens !== undefined &&
		usage.cacheWrite1hTokens !== undefined
	) {
		const expectedCost = costFromRate(
			{
				cacheReadTokens: usage.cacheReadTokens,
				cacheWrite1hTokens: usage.cacheWrite1hTokens,
				cacheWrite5mTokens: usage.cacheWrite5mTokens,
				inputTokens: usage.inputTokens,
				outputTokens: usage.outputTokens,
			},
			selected,
		);
		if (
			Math.abs(expectedCost - request.pricing.calculatedCostUsd) >
			PRICING_TOLERANCE_USD
		) {
			context.addIssue({
				code: "custom",
				message: "calculated cost contradicts usage and the selected rate",
				path: ["projection", "requests", index, "pricing"],
			});
		}
	}
}

function refineEvidencePricing(
	evidence: Immutable<EvidencePayload>,
	context: Readonly<RequestRefinementContext>,
): void {
	for (const [index, request] of evidence.projection.requests.entries()) {
		if (request.pricing.state === "complete") {
			refineCatalogReference(request, evidence, { context, index });
			refineCalculatedCost(request, { context, index });
		}
	}
}

const contextEvidenceSchema = evidencePayloadSchema.superRefine(
	(evidence, context) => {
		refineEvidencePricing(evidence, context);
	},
);

type ContextEvidence = Immutable<z.infer<typeof contextEvidenceSchema>>;

export { default as contextEvidenceSourceSchema } from "./context-evidence-source-contract";

export {
	contextRateCatalogSchema,
	usageIsZero,
	costFromRate,
} from "./context-evidence-rates-contract";

export {
	UNPRICED_STATES,
	UNPRICED_REASONS,
} from "./context-evidence-pricing-contract";

export type { UnpricedState } from "./context-evidence-pricing-contract";

export type { ContextEvidenceSource } from "./context-evidence-source-contract";

export type {
	ContextRateCatalog,
	ModelRate,
	PricedTokenUsage,
} from "./context-evidence-rates-contract";

export { contextEvidenceSchema, CONTEXT_EVIDENCE_SCHEMA_VERSION };

export type { ContextEvidence };
