import { describe, expect, it } from "bun:test";

import {
	contextEvidenceSchema,
	contextRateCatalogSchema,
	normalizeContextEvidence,
} from "#benchmark/context-evidence";

import { expectedRequestPricing } from "./context-evidence-expected-test-fixture";
import { rates } from "./context-evidence-rate-test-fixture";
import {
	fullUsage,
	objectAt,
	pricedCosts,
	required,
	sourceFixture,
	transcriptOnlySource,
	transcriptSourceWithMessage,
} from "./context-evidence-test-support";

async function pricesEachRequestFromItsModelAndReconciledCacheTTLCategories(): Promise<void> {
	const source = await sourceFixture();

	const evidence = normalizeContextEvidence(source, rates);

	expect(
		evidence.projection.requests.map(({ requestId, pricing }) => ({
			pricing,
			requestId,
		})),
	).toEqual(expectedRequestPricing);
}

function reportsARequestWhoseRowNamesNoModelAsModelMissing(): void {
	const evidence = normalizeContextEvidence(
		transcriptSourceWithMessage({ usage: fullUsage }),
	);

	const [request] = evidence.projection.requests;

	expect(request?.pricing).toEqual({ state: "model-missing" });
}

function pricesARequestThatConsumedNothingAtZeroWithNoRateSelected(): void {
	const evidence = normalizeContextEvidence(
		transcriptOnlySource({
			cache_creation: {
				ephemeral_1h_input_tokens: 0,
				ephemeral_5m_input_tokens: 0,
			},
			cache_creation_input_tokens: 0,
			cache_read_input_tokens: 0,
			input_tokens: 0,
			output_tokens: 0,
		}),
	);

	const [request] = evidence.projection.requests;

	expect(request?.pricing).toEqual({
		calculatedCostUsd: 0,
		state: "zero-usage",
	});
	expect(contextEvidenceSchema.safeParse(evidence).success).toBe(true);
}

const FIRST_OTEL_SPAN_ROW_INDEX = 0;

async function keepsConflictingRequestModelsOutOfCalculatedPricing(): Promise<void> {
	const source = await sourceFixture();
	const mainSpan = required(
		source.files.otelSpans[FIRST_OTEL_SPAN_ROW_INDEX],
		"fixture has no main span",
	);
	const attributes = objectAt(mainSpan, "attributes");
	source.files.otelSpans[FIRST_OTEL_SPAN_ROW_INDEX] = {
		...mainSpan,
		attributes: { ...attributes, model: "claude-conflicting-5" },
	};

	const evidence = normalizeContextEvidence(source, rates);
	const request = evidence.projection.requests.find(
		(candidate) => candidate.requestId === "req-main-1",
	);

	expect(request).toMatchObject({
		model: null,
		modelState: "conflict",
		pricing: { state: "model-conflict" },
	});
	expect(evidence.projection.accountingIssues).toContain("request-model");
}

const NO_PRICED_REQUESTS = 0;

const RATE_INCREASE_FACTOR = 2;

async function recordsTheRateSourceAndVersionAlongsideEachPricedCalculation(): Promise<void> {
	const source = await sourceFixture();

	const evidence = normalizeContextEvidence(source, rates);

	const priced = evidence.projection.requests.filter(
		(request) => request.pricing.state === "complete",
	);
	expect(priced.length).toBeGreaterThan(NO_PRICED_REQUESTS);
	for (const request of priced) {
		expect(request.pricing).toMatchObject({
			currency: "USD",
			rateSource: rates.source,
			rateVersion: rates.version,
		});
	}
}

async function leavesASavedCalculationUnchangedWhenTheRateCatalogChanges(): Promise<void> {
	const source = await sourceFixture();
	const dearer = contextRateCatalogSchema.parse({
		...rates,
		models: rates.models.map((rate) => ({
			...rate,
			inputUsdPerMillion: rate.inputUsdPerMillion * RATE_INCREASE_FACTOR,
		})),
		version: "2027-01-01",
	});
	const saved = contextEvidenceSchema.parse(
		normalizeContextEvidence(source, rates),
	);

	const later = contextEvidenceSchema.parse(
		normalizeContextEvidence(source, dearer),
	);

	expect(saved.rateCatalog).toEqual(rates);
	expect(later.rateCatalog).toEqual(dearer);
	expect(pricedCosts(later)).not.toEqual(pricedCosts(saved));
}

describe(normalizeContextEvidence.name, () => {
	it(
		"prices each request from its model and reconciled cache TTL categories",
		pricesEachRequestFromItsModelAndReconciledCacheTTLCategories,
	);

	it(
		"keeps conflicting request models out of calculated pricing",
		keepsConflictingRequestModelsOutOfCalculatedPricing,
	);

	it(
		"records the rate source and version alongside each priced calculation",
		recordsTheRateSourceAndVersionAlongsideEachPricedCalculation,
	);

	it(
		"leaves a saved calculation unchanged when the rate catalog changes",
		leavesASavedCalculationUnchangedWhenTheRateCatalogChanges,
	);
});

describe("transcript-supplied request usage", () => {
	it(
		"reports a request whose row names no model as model-missing",
		reportsARequestWhoseRowNamesNoModelAsModelMissing,
	);

	it(
		"prices a request that consumed nothing at zero with no rate selected",
		pricesARequestThatConsumedNothingAtZeroWithNoRateSelected,
	);
});
