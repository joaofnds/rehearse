import { z } from "zod";

const argumentsSchema = z.tuple([
	z.url().default("http://localhost:4173"),
	z.coerce.number().int().min(1).max(50).default(5),
]);
const [base, repetitions] = argumentsSchema.parse([Bun.argv[2], Bun.argv[3]]);
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

	if (!response.ok) {
		throw new Error(`${path}: HTTP ${String(response.status)}`);
	}

	if (
		path.startsWith("/api/") &&
		response.headers.get("content-type")?.includes("application/json") !== true
	) {
		throw new Error(`${path}: expected JSON; check that the API route exists`);
	}

	return {
		path,
		ms: rounded(performance.now() - started),
		bytes: bytes.length,
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

const paths = Bun.argv.length > 4 ? Bun.argv.slice(4) : DEFAULT_PATHS;
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
		samplesMs: samples.map(({ ms }) => ms),
	});
}

console.log(
	JSON.stringify({ base, repetitions, endpoints, startup }, undefined, 2),
);
