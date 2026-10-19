import type { LoadingBenchmark } from "./loading-performance";

interface EndpointFixture {
	readonly ms: number;
	readonly sha256: string | null;
}

function endpoint({
	ms,
	sha256,
}: EndpointFixture): LoadingBenchmark["endpoints"][number] {
	return {
		bytes: 100,
		firstMs: ms,
		medianMs: ms,
		p95Ms: ms,
		path: "/api/run-listing",
		samplesMs: Array.from({ length: 5 }, () => ms),
		sha256,
	};
}

interface ReportFixture {
	readonly ms?: number;
	readonly sha256?: string;
}

const defaultReport = { ms: 50, sha256: "same-data" };

function report({
	ms = defaultReport.ms,
	sha256 = defaultReport.sha256,
}: ReportFixture = {}): LoadingBenchmark {
	const reading = { bytes: 100, ms, path: "/api/run-listing", sha256 };
	return {
		base: "http://localhost:4173",
		endpoints: [
			{
				...reading,
				firstMs: ms,
				medianMs: ms,
				p95Ms: ms,
				samplesMs: Array.from({ length: 5 }, () => ms),
			},
		],
		environment: {
			arch: "arm64",
			bun: "1.4.0",
			cpu: "test",
			platform: "darwin",
		},
		repetitions: 5,
		startup: Array.from({ length: 5 }, () => ({
			freshness: {
				readyMs: ms,
				request: { ...reading, path: "/api/run-staleness" },
			},
			listReadyMs: ms,
			ms,
			requests: [reading],
		})),
		version: 1,
	};
}

interface StartupTimings {
	readonly endpointMs: number;
	readonly listReadyMs: number;
	readonly batchMs: number;
	readonly freshnessMs: number;
}

function timedReport({
	endpointMs,
	listReadyMs,
	batchMs,
	freshnessMs,
}: StartupTimings): LoadingBenchmark {
	const data = report({ ms: endpointMs });
	return {
		...data,
		startup: data.startup.map(({ requests, freshness }) => ({
			freshness: { readyMs: freshnessMs, request: freshness.request },
			listReadyMs,
			ms: batchMs,
			requests,
		})),
	};
}

export { endpoint, report, timedReport };
