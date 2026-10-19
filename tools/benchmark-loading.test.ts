import { expect, it } from "bun:test";

import LoadingApiResources from "./loading-api-test-support";
import { loadingBenchmarkSchema } from "./loading-performance";

const FAILED_BENCHMARK_EXIT_CODE = 1;
const REPORT_INDENT_SPACES = 2;

async function benchmark(
	base: string,
	extra: readonly string[] = [],
	endpoint = "/api/run-listing",
): Promise<{
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
}> {
	const child = Bun.spawn(
		[
			process.execPath,
			"tools/benchmark-loading.ts",
			base,
			"5",
			endpoint,
			"--max-list-ms",
			"60000",
			...extra,
		],
		{
			env: { ...Bun.env },
			stderr: "pipe",
			stdout: "pipe",
		},
	);
	const [code, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);

	return { code, stderr, stdout };
}

const resources = LoadingApiResources.forEachTest();
const customEndpoints = [
	{ label: "relative", path: (_base: string): string => "api/cases" },
	{
		label: "absolute",
		path: (base: string): string => new URL("/api/cases", base).href,
	},
];

it.each(customEndpoints)(
	"compares changed data for $label custom API endpoints",
	async ({ path }) => {
		const expectedCode = 0;

		const api = await resources.create("/api/cases");
		const endpoint = path(api.base);
		const baseline = await benchmark(api.base, [], endpoint);
		expect(baseline.code).toBe(expectedCode);
		const file = await api.saveBaseline(baseline.stdout);
		api.changeData();
		const changed = await benchmark(api.base, ["--baseline", file], endpoint);
		expect(changed.code).toBe(FAILED_BENCHMARK_EXIT_CODE);
		expect(changed.stderr).toContain(
			`${endpoint}: API data changed or was unstable`,
		);
	},
);

it("returns a complete formatted benchmark on stdout and success without a baseline", async () => {
	const expectedCode = 0;
	const expectedStartupCount = 5;

	const api = await resources.create();
	const baseline = await benchmark(api.base);
	expect(baseline.code).toBe(expectedCode);
	expect(baseline.stderr).toBe("");
	expect(baseline.stdout).toBe(
		`${JSON.stringify(JSON.parse(baseline.stdout), undefined, REPORT_INDENT_SPACES)}\n`,
	);
	const report = loadingBenchmarkSchema.parse(JSON.parse(baseline.stdout));
	expect(report.startup).toHaveLength(expectedStartupCount);
	expect(report.endpoints.map(({ path }) => path)).toEqual([
		"/api/run-listing",
	]);
});

it("returns failure and each API diagnostic when baseline data changes", async () => {
	const expectedCode = 1;

	const api = await resources.create();
	const baseline = await benchmark(api.base);
	const file = await api.saveBaseline(baseline.stdout);
	api.changeData();
	const changed = await benchmark(api.base, ["--baseline", file]);
	expect(changed.code).toBe(expectedCode);
	expect(changed.stderr).toBe(
		"/api/run-listing: API data changed or was unstable; use the same quiescent records and corpus\n/api/settings: API data changed or was unstable; use the same quiescent records and corpus\n/api/corpus-summary: API data changed or was unstable; use the same quiescent records and corpus\n/api/comparisons: API data changed or was unstable; use the same quiescent records and corpus\n/api/run-staleness: API data changed or was unstable; use the same quiescent records and corpus\n",
	);
});

it("rejects an API path answered by the HTML fallback", async () => {
	const server = Bun.serve({
		fetch: () =>
			new Response("<html>not an API</html>", {
				headers: { "Content-Type": "text/html" },
			}),
		hostname: "127.0.0.1",
		port: 0,
	});
	try {
		const expectedCode = 1;

		const result = await benchmark(server.url.href);
		expect(result.code).toBe(expectedCode);
		expect(result.stderr).toContain(
			"expected JSON; check that the API route exists",
		);
	} finally {
		await server.stop(true);
	}
});
