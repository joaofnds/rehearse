import { cpus } from "node:os";
import { parseArgs } from "node:util";

import { z } from "zod";

import {
	LOADING_BENCHMARK_POLICY,
	isApiEndpoint,
	loadingBenchmarkSchema,
	loadingPerformanceChecks,
} from "./loading-performance";

const SUPPORTED_POSITIONAL_ARGUMENT_COUNT = 2;
const QUANTILE_RANK_BASE = 1;
const PRIMARY_CPU_INDEX = 0;

const CLI_USER_ARGUMENTS_START_INDEX = 2;

const MIDPOINT_DIVISOR = 2;

const FINAL_TIMING_SAMPLE_OFFSET = -1;

const EMPTY_COLLECTION_LENGTH = 0;

const REQUEST_TIMEOUT_MS = 60_000;
const TIMING_TENTHS_PER_MS = 10;
const P95_QUANTILE = 0.95;
const REPORT_INDENT_SPACES = 2;

const { values, positionals } = parseArgs({
	allowPositionals: true,
	args: Bun.argv.slice(CLI_USER_ARGUMENTS_START_INDEX),
	options: {
		"allowance-ms": { default: "5", type: "string" },
		baseline: { type: "string" },
		"max-list-ms": { default: "100", type: "string" },
		"max-regression-percent": { default: "20", type: "string" },
	},
});
const limits = z
	.object({
		allowanceMs: z.coerce.number().nonnegative(),
		maximumListMs: z.coerce.number().positive(),
		maximumRegressionPercent: z.coerce.number().nonnegative(),
	})
	.parse({
		allowanceMs: values["allowance-ms"],
		maximumListMs: values["max-list-ms"],
		maximumRegressionPercent: values["max-regression-percent"],
	});

const argumentsSchema = z.tuple([
	z.url().default("http://localhost:4173"),
	z.coerce
		.number()
		.int()
		.min(LOADING_BENCHMARK_POLICY.minimumRepetitions)
		.max(LOADING_BENCHMARK_POLICY.maximumRepetitions)
		.default(LOADING_BENCHMARK_POLICY.defaultRepetitions),
]);
const [requestedBase, requestedRepetitions] = positionals;
const [base, repetitions] = argumentsSchema.parse([
	requestedBase,
	requestedRepetitions,
]);
const baseline =
	values.baseline === undefined
		? undefined
		: loadingBenchmarkSchema.parse(await Bun.file(values.baseline).json());
if (
	baseline !== undefined &&
	repetitions < LOADING_BENCHMARK_POLICY.minimumComparisonRepetitions
) {
	throw new Error("Baseline comparisons require at least five repetitions");
}
const DEFAULT_PATHS = [
	"/",
	"/api/run-listing",
	"/api/run-staleness",
	"/api/corpus-summary",
	"/api/runs",
	"/api/corpus",
	"/api/cases",
	"/api/comparisons",
	"/api/settings",
	"/api/settings/records",
	"/api/calibration",
] as const;
const STARTUP_PATHS = ["/api/corpus-summary", "/api/comparisons"] as const;

interface Reading {
	readonly path: string;
	readonly ms: number;
	readonly bytes: number;
	readonly sha256: string | null;
}

function rounded(value: number): number {
	return Math.round(value * TIMING_TENTHS_PER_MS) / TIMING_TENTHS_PER_MS;
}

async function read(path: string): Promise<Reading> {
	const started = performance.now();
	const response = await fetch(new URL(path, base), {
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	const bytes = await response.bytes();
	const ms = rounded(performance.now() - started);

	if (!response.ok) {
		throw new Error(`${path}: HTTP ${String(response.status)}`);
	}

	if (
		isApiEndpoint(path, base) &&
		response.headers.get("content-type")?.includes("application/json") !== true
	) {
		throw new Error(`${path}: expected JSON; check that the API route exists`);
	}

	return {
		bytes: bytes.length,
		ms,
		path,
		sha256: isApiEndpoint(path, base)
			? new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
			: null,
	};
}

interface InitialReading {
	readonly ms: number;
	readonly requests: readonly Reading[];
}

async function initialReading(
	listing: Promise<Reading>,
	settings: Promise<Reading>,
	started: number,
): Promise<InitialReading> {
	await listing;
	const requests = await Promise.all([
		listing,
		settings,
		...STARTUP_PATHS.map(async (path) => await read(path)),
	]);
	return { ms: rounded(performance.now() - started), requests };
}

interface FreshnessReading {
	readonly readyMs: number;
	readonly request: Reading;
}

async function freshnessReading(
	listing: Promise<Reading>,
	started: number,
): Promise<FreshnessReading> {
	await listing;
	const request = await read("/api/run-staleness");
	return { readyMs: rounded(performance.now() - started), request };
}

const paths =
	positionals.length > SUPPORTED_POSITIONAL_ARGUMENT_COUNT
		? positionals.slice(SUPPORTED_POSITIONAL_ARGUMENT_COUNT)
		: DEFAULT_PATHS;
const startup = await Array.fromAsync(
	Array.from({ length: repetitions }),
	async () => {
		const started = performance.now();
		const listing = read("/api/run-listing");
		const settings = read("/api/settings");
		const [initial, freshness, list] = await Promise.all([
			initialReading(listing, settings, started),
			freshnessReading(listing, started),
			listing,
		]);
		return { ...initial, freshness, listReadyMs: list.ms };
	},
);

const endpoints = await Array.fromAsync(paths, async (path) => {
	const samples: Reading[] = [];
	await Array.fromAsync(Array.from({ length: repetitions }), async () => {
		samples.push(await read(path));
	});
	const [firstSample] = samples;
	const sorted = samples
		.map(({ ms }) => ms)
		.toSorted((left, right) => left - right);
	return {
		bytes: samples.at(FINAL_TIMING_SAMPLE_OFFSET)?.bytes,
		firstMs: firstSample?.ms,
		medianMs: sorted[Math.floor(sorted.length / MIDPOINT_DIVISOR)],
		p95Ms: sorted[Math.ceil(sorted.length * P95_QUANTILE) - QUANTILE_RANK_BASE],
		path,
		samplesMs: samples.map(({ ms }) => ms),
		sha256: samples.every(({ sha256 }) => sha256 === firstSample?.sha256)
			? firstSample?.sha256
			: null,
	};
});

const report = loadingBenchmarkSchema.parse({
	base,
	endpoints,
	environment: {
		arch: process.arch,
		bun: Bun.version,
		cpu: cpus()[PRIMARY_CPU_INDEX]?.model ?? "unknown",
		platform: process.platform,
	},
	repetitions,
	startup,
	version: LOADING_BENCHMARK_POLICY.schemaVersion,
});
const gate = loadingPerformanceChecks(report, { ...limits, baseline });
process.stdout.write(
	`${JSON.stringify(
		{ ...report, gate, limits },
		undefined,
		REPORT_INDENT_SPACES,
	)}\n`,
);
if (gate.failures.length > EMPTY_COLLECTION_LENGTH) {
	process.stderr.write(`${gate.failures.join("\n")}\n`);
	process.exitCode = 1;
}
