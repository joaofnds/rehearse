import { expect, it } from "bun:test";

import { loadingPerformanceChecks, median } from "./loading-performance";
import {
	endpoint,
	report,
	timedReport,
} from "./loading-performance-test-support";

const MISSING_SAMPLE_MS = 0;

const STARTUP_SAMPLE_START_INDEX = 0;
const RETAINED_STARTUP_SAMPLE_COUNT = 1;

const FIRST_PERFORMANCE_FAILURE_INDEX = 0;

const limits = {
	allowanceMs: 5,
	maximumListMs: 100,
	maximumRegressionPercent: 20,
};

it("budgets list data independently of the opening batch and freshness", () => {
	expect(
		loadingPerformanceChecks(
			timedReport({
				batchMs: 200,

				endpointMs: 30,
				freshnessMs: 300,
				listReadyMs: 90,
			}),
			limits,
		).failures,
	).toEqual([]);
	expect(
		loadingPerformanceChecks(
			timedReport({
				batchMs: 120,

				endpointMs: 30,
				freshnessMs: 140,
				listReadyMs: 101,
			}),
			limits,
		).failures,
	).toEqual(["startup.listReadyMs budget: 101.0 ms exceeds 100.0 ms"]);
});

it("uses the median opening reading when the last sample is faster", () => {
	const data = report();
	const firstFastOpeningMs = 10;
	const lowerSlowOpeningMs = 150;
	const middleSlowOpeningMs = 160;
	const upperSlowOpeningMs = 170;
	const lastFastOpeningMs = 20;
	const samples = [
		firstFastOpeningMs,
		lowerSlowOpeningMs,
		middleSlowOpeningMs,
		upperSlowOpeningMs,
		lastFastOpeningMs,
	];
	const result = loadingPerformanceChecks(
		{
			...data,
			startup: data.startup.map(({ ms, requests, freshness }, index) => ({
				freshness,
				listReadyMs: samples[index] ?? MISSING_SAMPLE_MS,
				ms,
				requests,
			})),
		},
		limits,
	);
	expect(result.failures).toEqual([
		"startup.listReadyMs budget: 150.0 ms exceeds 100.0 ms",
	]);
});

it("compares each baseline metric with its own reading", () => {
	const result = loadingPerformanceChecks(
		timedReport({
			batchMs: 80,

			endpointMs: 50,
			freshnessMs: 102,
			listReadyMs: 20,
		}),
		{
			...limits,
			baseline: timedReport({
				batchMs: 70,

				endpointMs: 50,
				freshnessMs: 80,
				listReadyMs: 20,
			}),
		},
	);
	expect(result.checks.filter(({ passed }) => !passed)).toEqual([
		{
			actualMs: 102,
			limitMs: 101,
			metric: "startup.freshness.readyMs",
			passed: false,
		},
	]);
});
it("allows measured variation up to the relative limit plus fixed allowance", () => {
	const expectedCheckCount = 5;

	const result = loadingPerformanceChecks(report({ ms: 65 }), {
		...limits,
		baseline: report(),
	});
	expect(result.failures).toEqual([]);
	expect(result.checks).toHaveLength(expectedCheckCount);
});

it("fails each metric beyond its baseline allowance", () => {
	const result = loadingPerformanceChecks(report({ ms: 66 }), {
		...limits,
		baseline: report(),
	});
	expect(
		result.checks.filter(({ passed }) => !passed).map(({ metric }) => metric),
	).toEqual([
		"/api/run-listing",
		"startup.listReadyMs",
		"startup.ms",
		"startup.freshness.readyMs",
	]);
});

it("enforces the list budget even without a baseline", () => {
	const result = loadingPerformanceChecks(report({ ms: 101 }), limits);
	expect(result.failures).toEqual([
		"startup.listReadyMs budget: 101.0 ms exceeds 100.0 ms",
	]);
});

it("refuses a faster result when the API data changed", () => {
	const expectedFailureCount = 2;
	const expectedCheckCount = 1;

	const result = loadingPerformanceChecks(
		report({ ms: 10, sha256: "smaller-data" }),
		{
			...limits,
			baseline: report(),
		},
	);
	expect(result.failures).toHaveLength(expectedFailureCount);
	expect(
		result.failures.every((failure) => failure.includes("API data changed")),
	).toBe(true);
	expect(result.checks).toHaveLength(expectedCheckCount);
});

it("refuses data that changed between opening and endpoint samples", () => {
	const current = report({ ms: 10 });
	const result = loadingPerformanceChecks(
		{
			...current,
			endpoints: [endpoint({ ms: 10, sha256: null })],
		},
		{ ...limits, baseline: report() },
	);
	expect(result.failures[FIRST_PERFORMANCE_FAILURE_INDEX]).toContain(
		"/api/run-listing: API data changed or was unstable",
	);
});

it("refuses changed runtime or hardware", () => {
	const current = report();
	const result = loadingPerformanceChecks(
		{ ...current, environment: { ...current.environment, cpu: "different" } },
		{ ...limits, baseline: report() },
	);
	expect(result.failures).toEqual([
		"Runtime or machine differs from the baseline",
	]);
});

it("refuses a missing measured endpoint", () => {
	const current = report();
	const result = loadingPerformanceChecks(
		{ ...current, endpoints: [] },
		{ ...limits, baseline: report() },
	);
	expect(result.failures).toContain(
		"Measured endpoint set differs from the baseline",
	);
});

it("requires at least five opening samples for comparisons", () => {
	const current = report();
	const result = loadingPerformanceChecks(
		{
			...current,
			repetitions: 1,
			startup: current.startup.slice(
				STARTUP_SAMPLE_START_INDEX,
				RETAINED_STARTUP_SAMPLE_COUNT,
			),
		},
		{ ...limits, baseline: report() },
	);
	expect(result.failures[FIRST_PERFORMANCE_FAILURE_INDEX]).toContain(
		"at least five opening batches",
	);
});

it("refuses an incomplete endpoint measurement", () => {
	const current = report();
	const endpointSampleMs = 50;
	const result = loadingPerformanceChecks(
		{
			...current,
			endpoints: [
				{
					...endpoint({ ms: 50, sha256: "same-data" }),
					samplesMs: [endpointSampleMs],
				},
			],
		},
		{ ...limits, baseline: report() },
	);
	expect(result.failures[FIRST_PERFORMANCE_FAILURE_INDEX]).toContain(
		"Incomplete benchmark",
	);
});

it("uses the middle observed sample and rejects empty measurements", () => {
	const expectedMedian = 30;
	const maximumSampleMs = 90;
	const minimumSampleMs = 10;
	const middleSampleMs = 30;
	const lowerSampleMs = 20;
	const upperSampleMs = 40;

	expect(
		median([
			maximumSampleMs,
			minimumSampleMs,
			middleSampleMs,
			lowerSampleMs,
			upperSampleMs,
		]),
	).toBe(expectedMedian);
	expect(() => median([])).toThrow("at least one sample");
});
