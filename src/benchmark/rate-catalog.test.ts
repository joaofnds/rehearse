import { describe, expect, it } from "bun:test";

import { z } from "zod";

import { costFromRate } from "#benchmark/context-evidence-contract";
import { committedRateCatalog, rateFor } from "#benchmark/rate-catalog";

const COST_DRIFT_TOLERANCE_USD = 1e-12;

const recordedAttemptSchema = z.object({
	attemptPath: z.string().nonempty(),
	cacheReadTokens: z.number().int().nonnegative(),
	cacheWrite1hTokens: z.number().int().nonnegative(),
	cacheWrite5mTokens: z.number().int().nonnegative(),
	inputTokens: z.number().int().nonnegative(),
	outputTokens: z.number().int().nonnegative(),
	recordModelLabel: z.string().nonempty(),
	recordedCostUsd: z.number().nonnegative(),
	transcriptModel: z.string().nonempty(),
});

const recordedCostsSchema = z.object({
	attempts: z.array(recordedAttemptSchema).nonempty(),
	measuredOn: z.string().nonempty(),
	note: z.string().nonempty(),
});

async function recordedAttempts(): Promise<
	readonly z.infer<typeof recordedAttemptSchema>[]
> {
	const parsed = recordedCostsSchema.parse(
		await Bun.file(
			new URL("__fixtures__/recorded-attempt-costs.json", import.meta.url),
		).json(),
	);

	return parsed.attempts;
}

const committedRateCatalogRederivesEveryRecordedAttemptCostFromTheCataloguedRates =
	async (): Promise<void> => {
		const attempts = await recordedAttempts();

		const drifted = attempts.filter((attempt) => {
			const rate = rateFor(committedRateCatalog, attempt.transcriptModel);
			if (rate === undefined) {
				return true;
			}
			const derived = costFromRate(
				{
					cacheReadTokens: attempt.cacheReadTokens,
					cacheWrite1hTokens: attempt.cacheWrite1hTokens,
					cacheWrite5mTokens: attempt.cacheWrite5mTokens,
					inputTokens: attempt.inputTokens,
					outputTokens: attempt.outputTokens,
				},
				rate,
			);

			return (
				Math.abs(derived - attempt.recordedCostUsd) > COST_DRIFT_TOLERANCE_USD
			);
		});

		expect(
			drifted.map(
				(attempt) => `${attempt.transcriptModel} ${attempt.attemptPath}`,
			),
		).toEqual([]);
	};

const committedRateCatalogKeysItsRatesOnTheTranscriptModelStringRatherThanTheRecordsLabel =
	async (): Promise<void> => {
		const attempts = await recordedAttempts();

		const labels = [
			...new Set(attempts.map((attempt) => attempt.recordModelLabel)),
		];

		expect(rateFor(committedRateCatalog, "claude-sonnet-5")).toBeDefined();
		expect(rateFor(committedRateCatalog, "claude-opus-5")).toBeDefined();
		for (const label of labels) {
			expect(rateFor(committedRateCatalog, label)).toBeUndefined();
		}
	};

const committedRateCatalogNamesASourceThatNoCategoryContradicts = (): void => {
	const provenances = new Set(Object.values(committedRateCatalog.provenance));

	expect(provenances.has("publication-backed")).toBe(false);
	expect(committedRateCatalog.source).toBe("corpus-fit-with-tier-inferred-5m");
};

const committedRateCatalogMarksThe5mCachewriteRateAsInferredAndTheRestAsCorpusmeasured =
	(): void => {
		expect(committedRateCatalog.provenance).toEqual({
			cacheReadUsdPerMillion: "corpus-measured",
			cacheWrite1hUsdPerMillion: "corpus-measured",
			cacheWrite5mUsdPerMillion: "tier-inferred",
			inputUsdPerMillion: "corpus-measured",
			outputUsdPerMillion: "corpus-measured",
		});
	};

describe("committedRateCatalog", () => {
	it(
		"re-derives every recorded attempt cost from the catalogued rates",
		committedRateCatalogRederivesEveryRecordedAttemptCostFromTheCataloguedRates,
	);

	it(
		"keys its rates on the transcript model string rather than the record's label",
		committedRateCatalogKeysItsRatesOnTheTranscriptModelStringRatherThanTheRecordsLabel,
	);

	it(
		"names a source that no category contradicts",
		committedRateCatalogNamesASourceThatNoCategoryContradicts,
	);

	it(
		"marks the 5m cache-write rate as inferred and the rest as corpus-measured",
		committedRateCatalogMarksThe5mCachewriteRateAsInferredAndTheRestAsCorpusmeasured,
	);
});
