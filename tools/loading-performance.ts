import { LOADING_BENCHMARK_POLICY } from "./loading-benchmark";
import type { LoadingBenchmark } from "./loading-benchmark";

const SINGLE_STABLE_HASH_COUNT = 1;

const BASELINE_LATENCY_FACTOR = 1;

const MIDPOINT_DIVISOR = 2;

const EMPTY_COLLECTION_LENGTH = 0;

const PERCENT_SCALE = 100;
const TIMING_DECIMAL_PLACES = 1;

function isApiEndpoint(path: string, base: string): boolean {
	return new URL(path, base).pathname.startsWith("/api/");
}

function median(samples: readonly number[]): number {
	const sorted = samples.toSorted((left, right) => left - right);
	const value = sorted[Math.floor(sorted.length / MIDPOINT_DIVISOR)];
	if (value === undefined) {
		throw new Error("A performance metric needs at least one sample");
	}

	return value;
}

function fingerprints(
	report: LoadingBenchmark,
): Map<string, Set<string | null>> {
	const readings = [
		...report.endpoints,
		...report.startup.flatMap(({ requests, freshness }) => [
			...requests,
			freshness.request,
		]),
	];
	const result = new Map<string, Set<string | null>>();

	for (const { path, sha256 } of readings) {
		if (isApiEndpoint(path, report.base)) {
			const hashes = result.get(path) ?? new Set<string | null>();
			hashes.add(sha256);
			result.set(path, hashes);
		}
	}

	return result;
}

function metrics(report: LoadingBenchmark): Map<string, number> {
	return new Map([
		...report.endpoints.map(({ path, medianMs }) => [path, medianMs] as const),
		[
			"startup.listReadyMs",
			median(report.startup.map(({ listReadyMs }) => listReadyMs)),
		],
		["startup.ms", median(report.startup.map(({ ms }) => ms))],
		[
			"startup.freshness.readyMs",
			median(report.startup.map(({ freshness }) => freshness.readyMs)),
		],
	]);
}

function comparabilityFailures(
	current: LoadingBenchmark,
	baseline: LoadingBenchmark,
): string[] {
	const failures: string[] = [];
	if (
		current.startup.length <
			LOADING_BENCHMARK_POLICY.minimumComparisonRepetitions ||
		baseline.startup.length <
			LOADING_BENCHMARK_POLICY.minimumComparisonRepetitions
	) {
		failures.push(
			"Baseline comparisons require at least five opening batches in each report",
		);
	}
	if (
		(["bun", "platform", "arch", "cpu"] as const).some(
			(key) => current.environment[key] !== baseline.environment[key],
		)
	) {
		failures.push("Runtime or machine differs from the baseline");
	}
	return failures;
}

function completenessFailures(report: LoadingBenchmark): string[] {
	return report.startup.length !== report.repetitions ||
		report.endpoints.some(
			({ samplesMs }) =>
				samplesMs.length !== report.repetitions ||
				samplesMs.length <
					LOADING_BENCHMARK_POLICY.minimumComparisonRepetitions,
		)
		? [
				"Incomplete benchmark: each metric needs the declared repetitions, at least five for comparison",
			]
		: [];
}

function fingerprintFailures(
	current: LoadingBenchmark,
	baseline: LoadingBenchmark,
): string[] {
	const failures: string[] = [];
	const before = fingerprints(baseline);
	const after = fingerprints(current);

	for (const path of new Set([...before.keys(), ...after.keys()])) {
		const oldHashes = before.get(path);
		const newHashes = after.get(path);
		if (
			oldHashes?.size !== SINGLE_STABLE_HASH_COUNT ||
			newHashes?.size !== SINGLE_STABLE_HASH_COUNT ||
			oldHashes.has(null) ||
			newHashes.has(null) ||
			oldHashes.values().next().value !== newHashes.values().next().value
		) {
			failures.push(
				`${path}: API data changed or was unstable; use the same quiescent records and corpus`,
			);
		}
	}
	return failures;
}

function metricSetFailures(
	current: LoadingBenchmark,
	baseline: LoadingBenchmark,
): string[] {
	const prior = metrics(baseline);
	const next = metrics(current);
	return prior.size !== next.size ||
		[...prior.keys()].some((key) => !next.has(key))
		? ["Measured endpoint set differs from the baseline"]
		: [];
}

function comparisonFailures(
	current: LoadingBenchmark,
	baseline: LoadingBenchmark,
): string[] {
	return [
		...comparabilityFailures(current, baseline),
		...[baseline, current].flatMap((report) => completenessFailures(report)),
		...fingerprintFailures(current, baseline),
		...metricSetFailures(current, baseline),
	];
}

interface PerformanceCheck {
	readonly metric: string;
	readonly actualMs: number;
	readonly limitMs: number;
	readonly passed: boolean;
}

interface PerformanceGate {
	readonly checks: readonly PerformanceCheck[];
	readonly failures: readonly string[];
}

interface PerformanceLimits {
	readonly maximumListMs: number;
	readonly maximumRegressionPercent: number;
	readonly allowanceMs: number;
}

interface PerformanceOptions extends PerformanceLimits {
	readonly baseline?: LoadingBenchmark | undefined;
}

function listBudgetCheck(
	current: LoadingBenchmark,
	maximumListMs: number,
): PerformanceCheck {
	const listMs = median(current.startup.map(({ listReadyMs }) => listReadyMs));
	return {
		actualMs: listMs,
		limitMs: maximumListMs,
		metric: "startup.listReadyMs budget",
		passed: listMs <= maximumListMs,
	};
}

function regressionChecks(
	current: LoadingBenchmark,
	baseline: LoadingBenchmark,
	options: PerformanceLimits,
): PerformanceCheck[] {
	const checks: PerformanceCheck[] = [];
	const prior = metrics(baseline);
	const next = metrics(current);
	for (const [metric, actualMs] of next) {
		const oldMs = prior.get(metric);
		if (oldMs === undefined) {
			throw new Error(`Missing baseline metric ${metric}`);
		}
		const limitMs =
			oldMs *
				(BASELINE_LATENCY_FACTOR +
					options.maximumRegressionPercent / PERCENT_SCALE) +
			options.allowanceMs;
		checks.push({ actualMs, limitMs, metric, passed: actualMs <= limitMs });
	}
	return checks;
}

function loadingPerformanceChecks(
	current: LoadingBenchmark,
	options: PerformanceOptions,
): PerformanceGate {
	const checks = [listBudgetCheck(current, options.maximumListMs)];
	const { baseline } = options;
	const failures =
		baseline === undefined ? [] : comparisonFailures(current, baseline);
	if (baseline !== undefined && failures.length === EMPTY_COLLECTION_LENGTH) {
		checks.push(...regressionChecks(current, baseline, options));
	}
	return {
		checks,
		failures: [
			...failures,
			...checks
				.filter(({ passed }) => !passed)
				.map(
					(check) =>
						`${check.metric}: ${check.actualMs.toFixed(TIMING_DECIMAL_PLACES)} ms exceeds ${check.limitMs.toFixed(TIMING_DECIMAL_PLACES)} ms`,
				),
		],
	};
}

export { isApiEndpoint, median, loadingPerformanceChecks };
export {
	LOADING_BENCHMARK_POLICY,
	loadingBenchmarkSchema,
} from "./loading-benchmark";
export type { LoadingBenchmark } from "./loading-benchmark";
export type { PerformanceCheck, PerformanceGate };
