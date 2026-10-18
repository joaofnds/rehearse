import { describe, expect, it } from "bun:test";
import type { LoadingBenchmark } from "./loading-performance";
import { loadingPerformanceChecks, median } from "./loading-performance";

function endpoint(
	ms: number,
	sha256: string | null,
): LoadingBenchmark["endpoints"][number] {
	return {
		path: "/api/run-listing",
		firstMs: ms,
		medianMs: ms,
		p95Ms: ms,
		bytes: 100,
		sha256,
		samplesMs: Array.from({ length: 5 }, () => ms),
	};
}

function report(ms = 50, sha256 = "same-data"): LoadingBenchmark {
	const reading = { path: "/api/run-listing", ms, bytes: 100, sha256 };
	return {
		version: 1,
		base: "http://localhost:4173",
		repetitions: 5,
		environment: {
			bun: "1.4.0",
			platform: "darwin",
			arch: "arm64",
			cpu: "test",
		},
		endpoints: [
			{
				...reading,
				firstMs: ms,
				medianMs: ms,
				p95Ms: ms,
				samplesMs: Array.from({ length: 5 }, () => ms),
			},
		],
		startup: Array.from({ length: 5 }, () => ({
			ms,
			listReadyMs: ms,
			requests: [reading],
			freshness: {
				readyMs: ms,
				request: { ...reading, path: "/api/run-staleness" },
			},
		})),
	};
}

const limits = {
	maximumListMs: 100,
	maximumRegressionPercent: 20,
	allowanceMs: 5,
};

function timedReport(
	endpointMs: number,
	listReadyMs: number,
	batchMs: number,
	freshnessMs: number,
): LoadingBenchmark {
	const data = report(endpointMs);
	return {
		...data,
		startup: data.startup.map(({ requests, freshness }) => ({
			ms: batchMs,
			listReadyMs,
			requests,
			freshness: { readyMs: freshnessMs, request: freshness.request },
		})),
	};
}

describe("loading performance gate", () => {
	it("budgets list data independently of the opening batch and freshness", () => {
		expect(
			loadingPerformanceChecks(timedReport(30, 90, 200, 300), limits).failures,
		).toEqual([]);
		expect(
			loadingPerformanceChecks(timedReport(30, 101, 120, 140), limits).failures,
		).toEqual(["startup.listReadyMs budget: 101.0 ms exceeds 100.0 ms"]);
	});

	it("uses the median opening reading when the last sample is faster", () => {
		const data = report();
		const samples = [10, 150, 160, 170, 20];
		const result = loadingPerformanceChecks(
			{
				...data,
				startup: data.startup.map(({ ms, requests, freshness }, index) => ({
					ms,
					requests,
					freshness,
					listReadyMs: samples[index] ?? 0,
				})),
			},
			limits,
		);
		expect(result.failures).toEqual([
			"startup.listReadyMs budget: 150.0 ms exceeds 100.0 ms",
		]);
	});

	it("compares each baseline metric with its own reading", () => {
		const result = loadingPerformanceChecks(timedReport(50, 20, 80, 102), {
			...limits,
			baseline: timedReport(50, 20, 70, 80),
		});
		expect(result.checks.filter(({ passed }) => !passed)).toEqual([
			{
				metric: "startup.freshness.readyMs",
				actualMs: 102,
				limitMs: 101,
				passed: false,
			},
		]);
	});
	it("allows measured variation up to the relative limit plus fixed allowance", () => {
		const result = loadingPerformanceChecks(report(65), {
			...limits,
			baseline: report(),
		});
		expect(result.failures).toEqual([]);
		expect(result.checks).toHaveLength(5);
	});

	it("fails each metric beyond its baseline allowance", () => {
		const result = loadingPerformanceChecks(report(66), {
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
		const result = loadingPerformanceChecks(report(101), limits);
		expect(result.failures).toEqual([
			"startup.listReadyMs budget: 101.0 ms exceeds 100.0 ms",
		]);
	});

	it("refuses a faster result when the API data changed", () => {
		const result = loadingPerformanceChecks(report(10, "smaller-data"), {
			...limits,
			baseline: report(),
		});
		expect(result.failures).toHaveLength(2);
		expect(
			result.failures.every((failure) => failure.includes("API data changed")),
		).toBe(true);
		expect(result.checks).toHaveLength(1);
	});

	it("refuses data that changed between opening and endpoint samples", () => {
		const current = report(10);
		const result = loadingPerformanceChecks(
			{
				...current,
				endpoints: [endpoint(10, null)],
			},
			{ ...limits, baseline: report() },
		);
		expect(result.failures[0]).toContain(
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
			{ ...current, repetitions: 1, startup: current.startup.slice(0, 1) },
			{ ...limits, baseline: report() },
		);
		expect(result.failures[0]).toContain("at least five opening batches");
	});

	it("refuses an incomplete endpoint measurement", () => {
		const current = report();
		const result = loadingPerformanceChecks(
			{
				...current,
				endpoints: [{ ...endpoint(50, "same-data"), samplesMs: [50] }],
			},
			{ ...limits, baseline: report() },
		);
		expect(result.failures[0]).toContain("Incomplete benchmark");
	});

	it("uses the middle observed sample and rejects empty measurements", () => {
		expect(median([90, 10, 30, 20, 40])).toBe(30);
		expect(() => median([])).toThrow("at least one sample");
	});
});
