import { describe, expect, it } from "bun:test";
import {
	buildPairedEstimate,
	buildSingleCaseMeanEstimate,
	buildSingleCaseProportionEstimate,
} from "./comparison-estimator";

describe(buildPairedEstimate.name, () => {
	it("averages within cases before estimating paired differences", () => {
		const cases = [
			{
				caseId: "case-1",
				minuend: [1, 1],
				subtrahend: [0, 1],
			},
			{
				caseId: "case-2",
				minuend: [1, 1],
				subtrahend: [0, 0],
			},
		];

		const estimate = buildPairedEstimate(cases);

		expect(estimate).toEqual({
			caseDeltas: [
				{ caseId: "case-1", value: 0.5 },
				{ caseId: "case-2", value: 1 },
			],
			meanDelta: 0.75,
			standardError: 0.25,
		});
	});

	it("ignores rep ordinal order within each case arm", () => {
		const cases = [
			{
				caseId: "case-1",
				minuend: [1, 0],
				subtrahend: [1, 0],
			},
			{
				caseId: "case-2",
				minuend: [1, 1],
				subtrahend: [0, 0],
			},
		];

		const forward = buildPairedEstimate(cases);
		const reversed = buildPairedEstimate(
			cases.map((benchmarkCase) => ({
				caseId: benchmarkCase.caseId,
				minuend: benchmarkCase.minuend,
				subtrahend: benchmarkCase.subtrahend.toReversed(),
			})),
		);

		expect(forward).toEqual({
			caseDeltas: [
				{ caseId: "case-1", value: 0 },
				{ caseId: "case-2", value: 1 },
			],
			meanDelta: 0.5,
			standardError: 0.5,
		});
		expect(reversed).toEqual(forward);
	});
});

describe(buildSingleCaseProportionEstimate.name, () => {
	it("estimates an unpaired difference of proportions over rep counts", () => {
		const estimate = buildSingleCaseProportionEstimate({
			minuend: { successful: 5, requested: 6 },
			subtrahend: { successful: 2, requested: 6 },
		});

		expect(estimate.delta).toBeCloseTo(0.5, 10);
		expect(estimate.standardError).toBeCloseTo(0.2453, 4);
	});

	it("reports a non-degenerate interval for each arm when every rep agrees", () => {
		const estimate = buildSingleCaseProportionEstimate({
			minuend: { successful: 6, requested: 6 },
			subtrahend: { successful: 0, requested: 6 },
		});

		expect(estimate.standardError).toBe(0);
		expect(estimate.minuend.interval.low).toBeCloseTo(0.61, 2);
		expect(estimate.minuend.interval.high).toBe(1);
		expect(estimate.subtrahend.interval.low).toBe(0);
		expect(estimate.subtrahend.interval.high).toBeCloseTo(0.39, 2);
	});
});

describe(buildSingleCaseMeanEstimate.name, () => {
	it("estimates an unpaired difference of means over per-rep values", () => {
		const estimate = buildSingleCaseMeanEstimate({
			minuend: [0.4, 0.44],
			subtrahend: [0.35, 0.39],
		});

		expect(estimate.delta).toBeCloseTo(0.05, 10);
		expect(estimate.spread.status).toBe("ESTIMATED");
		if (estimate.spread.status === "ESTIMATED") {
			expect(estimate.spread.standardError).toBeCloseTo(0.028284, 5);
		}
	});

	it("estimates the spread when only one arm varies", () => {
		const estimate = buildSingleCaseMeanEstimate({
			minuend: [0.4, 0.44],
			subtrahend: [0.37, 0.37],
		});

		expect(estimate.spread.status).toBe("ESTIMATED");
		if (estimate.spread.status === "ESTIMATED") {
			expect(estimate.spread.standardError).toBeCloseTo(0.02, 10);
		}
	});

	it("records that an arm had no observed spread instead of a zero standard error", () => {
		const estimate = buildSingleCaseMeanEstimate({
			minuend: [0.42, 0.42, 0.42, 0.42],
			subtrahend: [0.37, 0.37, 0.37, 0.37],
		});

		expect(estimate.delta).toBeCloseTo(0.05, 10);
		expect(estimate.spread).toEqual({ status: "NO_OBSERVED_SPREAD" });
	});
});
