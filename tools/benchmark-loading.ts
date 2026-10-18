import { z } from "zod";
import { cpus } from "node:os";
import { parseArgs } from "node:util";
import {
	loadingBenchmarkSchema,
	loadingPerformanceChecks,
	isApiEndpoint,
} from "./loading-performance";

const { values, positionals } = parseArgs({
	args: Bun.argv.slice(2),
	allowPositionals: true,
	options: {
		baseline: { type: "string" },
		"max-list-ms": { type: "string", default: "100" },
		"max-regression-percent": { type: "string", default: "20" },
		"allowance-ms": { type: "string", default: "5" },
	},
});
const limits = z
	.object({
		maximumListMs: z.coerce.number().positive(),
		maximumRegressionPercent: z.coerce.number().nonnegative(),
		allowanceMs: z.coerce.number().nonnegative(),
	})
	.parse({
		maximumListMs: values["max-list-ms"],
		maximumRegressionPercent: values["max-regression-percent"],
		allowanceMs: values["allowance-ms"],
	});

const argumentsSchema = z.tuple([
	z.url().default("http://localhost:4173"),
	z.coerce.number().int().min(1).max(50).default(5),
]);
const [base, repetitions] = argumentsSchema.parse([
	positionals[0],
	positionals[1],
]);
const baseline =
	values.baseline === undefined
		? undefined
		: loadingBenchmarkSchema.parse(await Bun.file(values.baseline).json());
if (baseline !== undefined && repetitions < 5) {
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
	return Math.round(value * 10) / 10;
}

async function read(path: string): Promise<Reading> {
	const started = performance.now();
	const response = await fetch(new URL(path, base), {
		signal: AbortSignal.timeout(60_000),
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
		path,
		ms,
		bytes: bytes.length,
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
		...STARTUP_PATHS.map((path) => read(path)),
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

const paths = positionals.length > 2 ? positionals.slice(2) : DEFAULT_PATHS;
const startup = [];
for (let index = 0; index < repetitions; index += 1) {
	const started = performance.now();
	const listing = read("/api/run-listing");
	const settings = read("/api/settings");
	const [initial, freshness, list] = await Promise.all([
		initialReading(listing, settings, started),
		freshnessReading(listing, started),
		listing,
	]);
	startup.push({ ...initial, listReadyMs: list.ms, freshness });
}

const endpoints = [];
for (const path of paths) {
	const samples: Reading[] = [];
	for (let index = 0; index < repetitions; index += 1) {
		samples.push(await read(path));
	}
	const sorted = samples
		.map(({ ms }) => ms)
		.toSorted((left, right) => left - right);
	endpoints.push({
		path,
		firstMs: samples[0]?.ms,
		medianMs: sorted[Math.floor(sorted.length / 2)],
		p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
		bytes: samples.at(-1)?.bytes,
		sha256: samples.every(({ sha256 }) => sha256 === samples[0]?.sha256)
			? samples[0]?.sha256
			: null,
		samplesMs: samples.map(({ ms }) => ms),
	});
}

const report = loadingBenchmarkSchema.parse({
	version: 1,
	base,
	repetitions,
	environment: {
		bun: Bun.version,
		platform: process.platform,
		arch: process.arch,
		cpu: cpus()[0]?.model ?? "unknown",
	},
	endpoints,
	startup,
});
const gate = loadingPerformanceChecks(report, { ...limits, baseline });
console.log(JSON.stringify({ ...report, limits, gate }, undefined, 2));
if (gate.failures.length > 0) {
	console.error(gate.failures.join("\n"));
	process.exitCode = 1;
}
