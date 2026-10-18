import { z } from "zod";
import type { Immutable } from "#benchmark/contracts";

const readingSchema = z.object({
	path: z.string(),
	ms: z.number().nonnegative(),
	bytes: z.number().int().nonnegative(),
	sha256: z.string().nullable(),
});

export const loadingBenchmarkSchema = z.object({
	version: z.literal(1),
	base: z.url(),
	repetitions: z.number().int().min(1).max(50),
	environment: z.object({
		bun: z.string(),
		platform: z.string(),
		arch: z.string(),
		cpu: z.string(),
	}),
	endpoints: z
		.array(
			z.object({
				path: z.string(),
				firstMs: z.number().nonnegative(),
				medianMs: z.number().nonnegative(),
				p95Ms: z.number().nonnegative(),
				bytes: z.number().int().nonnegative(),
				sha256: z.string().nullable(),
				samplesMs: z.array(z.number().nonnegative()).min(1),
			}),
		)
		.min(1),
	startup: z
		.array(
			z.object({
				ms: z.number().nonnegative(),
				listReadyMs: z.number().nonnegative(),
				requests: z.array(readingSchema).min(1),
				freshness: z.object({
					readyMs: z.number().nonnegative(),
					request: readingSchema,
				}),
			}),
		)
		.min(1),
});

export type LoadingBenchmark = Immutable<
	z.infer<typeof loadingBenchmarkSchema>
>;

export function isApiEndpoint(path: string, base: string): boolean {
	return new URL(path, base).pathname.startsWith("/api/");
}

export function median(samples: readonly number[]): number {
	const sorted = samples.toSorted((left, right) => left - right);
	const value = sorted[Math.floor(sorted.length / 2)];
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

function comparisonFailures(
	current: LoadingBenchmark,
	baseline: LoadingBenchmark,
): string[] {
	const failures: string[] = [];
	if (current.startup.length < 5 || baseline.startup.length < 5) {
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
	for (const report of [baseline, current]) {
		if (
			report.startup.length !== report.repetitions ||
			report.endpoints.some(
				({ samplesMs }) =>
					samplesMs.length !== report.repetitions || samplesMs.length < 5,
			)
		) {
			failures.push(
				"Incomplete benchmark: each metric needs the declared repetitions, at least five for comparison",
			);
		}
	}
	const before = fingerprints(baseline);
	const after = fingerprints(current);

	for (const path of new Set([...before.keys(), ...after.keys()])) {
		const oldHashes = before.get(path);
		const newHashes = after.get(path);
		if (
			oldHashes?.size !== 1 ||
			newHashes?.size !== 1 ||
			oldHashes.has(null) ||
			newHashes.has(null) ||
			[...oldHashes][0] !== [...newHashes][0]
		) {
			failures.push(
				`${path}: API data changed or was unstable; use the same quiescent records and corpus`,
			);
		}
	}
	const prior = metrics(baseline);
	const next = metrics(current);
	if (
		prior.size !== next.size ||
		[...prior.keys()].some((key) => !next.has(key))
	) {
		failures.push("Measured endpoint set differs from the baseline");
	}

	return failures;
}

export interface PerformanceCheck {
	readonly metric: string;
	readonly actualMs: number;
	readonly limitMs: number;
	readonly passed: boolean;
}

export interface PerformanceGate {
	readonly checks: readonly PerformanceCheck[];
	readonly failures: readonly string[];
}

export function loadingPerformanceChecks(
	current: LoadingBenchmark,
	options: {
		readonly baseline?: LoadingBenchmark | undefined;
		readonly maximumListMs: number;
		readonly maximumRegressionPercent: number;
		readonly allowanceMs: number;
	},
): PerformanceGate {
	const checks: PerformanceCheck[] = [];
	const failures: string[] = [];
	const listMs = median(current.startup.map(({ listReadyMs }) => listReadyMs));
	checks.push({
		metric: "startup.listReadyMs budget",
		actualMs: listMs,
		limitMs: options.maximumListMs,
		passed: listMs <= options.maximumListMs,
	});
	const { baseline } = options;
	if (baseline !== undefined) {
		failures.push(...comparisonFailures(current, baseline));
		const prior = metrics(baseline);
		const next = metrics(current);
		if (failures.length === 0) {
			for (const [metric, actualMs] of next) {
				const oldMs = prior.get(metric);
				if (oldMs === undefined) {
					throw new Error(`Missing baseline metric ${metric}`);
				}

				const limitMs =
					oldMs * (1 + options.maximumRegressionPercent / 100) +
					options.allowanceMs;
				checks.push({ metric, actualMs, limitMs, passed: actualMs <= limitMs });
			}
		}
	}
	for (const check of checks) {
		if (!check.passed) {
			failures.push(
				`${check.metric}: ${check.actualMs.toFixed(1)} ms exceeds ${check.limitMs.toFixed(1)} ms`,
			);
		}
	}

	return { checks, failures };
}
