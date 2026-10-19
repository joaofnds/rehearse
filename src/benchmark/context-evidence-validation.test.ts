import { describe, expect, it } from "bun:test";

import {
	contextEvidenceSchema,
	contextRateCatalogSchema,
	normalizeContextEvidence,
} from "#benchmark/context-evidence";

import { rates, sonnetRate } from "./context-evidence-rate-test-fixture";
import {
	alsoObservedByOtel,
	pricedEvidenceFixture,
	required,
	sourceFixture,
} from "./context-evidence-test-support";

async function rejectsCompleteAccountingWithUnresolvedEvidence(): Promise<void> {
	const { evidence } = await pricedEvidenceFixture();
	expect(
		contextEvidenceSchema.safeParse({
			...evidence,
			projection: {
				...evidence.projection,
				accountingState: "complete",
			},
		}).success,
	).toBe(false);
}

const COST_MISMATCH_USD = 1;

async function rejectsACalculatedCostThatContradictsUsage(): Promise<void> {
	const { evidence, pricedRequest, pricing, beforePriced, afterPriced } =
		await pricedEvidenceFixture();
	expect(
		contextEvidenceSchema.safeParse({
			...evidence,
			projection: {
				...evidence.projection,
				requests: [
					...beforePriced,
					{
						...pricedRequest,
						pricing: {
							...pricing,
							calculatedCostUsd: pricing.calculatedCostUsd + COST_MISMATCH_USD,
						},
					},
					...afterPriced,
				],
			},
		}).success,
	).toBe(false);
}

const RATE_INCREASE_FACTOR = 2;

async function rejectsASavedCalculationSwappedOntoACatalogThatDidNotPriceIt(): Promise<void> {
	const source = await sourceFixture();
	const dearer = contextRateCatalogSchema.parse({
		...rates,
		models: rates.models.map((rate) => ({
			...rate,
			inputUsdPerMillion: rate.inputUsdPerMillion * RATE_INCREASE_FACTOR,
		})),
		version: "2027-01-01",
	});
	const saved = normalizeContextEvidence(source, rates);

	const swapped = contextEvidenceSchema.safeParse({
		...saved,
		rateCatalog: dearer,
	});

	expect(swapped.success).toBe(false);
}

function rejectsDuplicateModelRatesAndNonUSDCatalogs(): void {
	expect(
		contextRateCatalogSchema.safeParse({
			...rates,
			models: [sonnetRate, sonnetRate],
		}).success,
	).toBe(false);
	expect(
		contextRateCatalogSchema.safeParse({ ...rates, currency: "EUR" }).success,
	).toBe(false);
}

async function rejectsARateSelectedForADifferentModel(): Promise<void> {
	const { evidence, pricedRequest, pricing, beforePriced, afterPriced } =
		await pricedEvidenceFixture();
	expect(
		contextEvidenceSchema.safeParse({
			...evidence,
			projection: {
				...evidence.projection,
				requests: [
					...beforePriced,
					{
						...pricedRequest,
						pricing: {
							...pricing,
							selectedRate: {
								...pricing.selectedRate,
								model: "wrong-model",
							},
						},
					},
					...afterPriced,
				],
			},
		}).success,
	).toBe(false);
}

async function rejectsCompleteUsageWithNoUsagePayload(): Promise<void> {
	const { evidence, pricedRequest, requestWithoutUsage } =
		await pricedEvidenceFixture();
	expect(
		contextEvidenceSchema.safeParse({
			...evidence,
			projection: {
				...evidence.projection,
				requests: [
					{ ...requestWithoutUsage, usageState: "complete" },
					...evidence.projection.requests.filter(
						(request) => request !== pricedRequest,
					),
				],
			},
		}).success,
	).toBe(false);
}

const EXPECTED_OTEL_OCCURRENCES = 1;

function leavesARequestUnpricedWhenItsOtelRowCarriedNoTokens(): void {
	const evidence = normalizeContextEvidence(alsoObservedByOtel({}));

	const [request] = evidence.projection.requests;

	expect(request?.otelOccurrences).toBe(EXPECTED_OTEL_OCCURRENCES);
	expect(request?.usageState).toBe("partial");
	expect(request?.usage).toBeUndefined();
	expect(request?.pricing).toEqual({ state: "usage-missing" });
}

async function rejectsARouteNamingASourceTheRecordNeverObserved(): Promise<void> {
	const evidence = normalizeContextEvidence(await sourceFixture());
	const [first, ...rest] = evidence.projection.requests;
	const otelSupplied = required(first, "fixture has no requests");

	expect(
		contextEvidenceSchema.safeParse({
			...evidence,
			projection: {
				...evidence.projection,
				requests: [
					{ ...otelSupplied, otelOccurrences: 0, uniqueOtelOccurrences: 0 },
					...rest,
				],
			},
		}).success,
	).toBe(false);
}

describe(normalizeContextEvidence.name, () => {
	it(
		"rejects complete accounting with unresolved evidence",
		rejectsCompleteAccountingWithUnresolvedEvidence,
	);

	it(
		"rejects a calculated cost that contradicts usage",
		rejectsACalculatedCostThatContradictsUsage,
	);

	it(
		"rejects a saved calculation swapped onto a catalog that did not price it",
		rejectsASavedCalculationSwappedOntoACatalogThatDidNotPriceIt,
	);

	it(
		"rejects duplicate model rates and non-USD catalogs",
		rejectsDuplicateModelRatesAndNonUSDCatalogs,
	);

	it(
		"rejects a rate selected for a different model",
		rejectsARateSelectedForADifferentModel,
	);

	it(
		"rejects complete usage with no usage payload",
		rejectsCompleteUsageWithNoUsagePayload,
	);
});

describe("transcript-supplied request usage", () => {
	it(
		"leaves a request unpriced when its otel row carried no tokens",
		leavesARequestUnpricedWhenItsOtelRowCarriedNoTokens,
	);

	it(
		"rejects a route naming a source the record never observed",
		rejectsARouteNamingASourceTheRecordNeverObserved,
	);
});
