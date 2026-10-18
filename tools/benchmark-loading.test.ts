import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadingBenchmarkSchema } from "./loading-performance";

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
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const [code, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);

	return { code, stdout, stderr };
}

describe("loading benchmark command", () => {
	const customEndpoints = [
		{ label: "relative", path: (_base: string): string => "api/cases" },
		{
			label: "absolute",
			path: (base: string): string => new URL("/api/cases", base).href,
		},
	];
	for (const { label, path } of customEndpoints) {
		it(`compares changed data for ${label} custom API endpoints`, async () => {
			const directory = await mkdtemp(
				join(tmpdir(), "rehearse-loading-custom-"),
			);
			let caseVersion = 1;
			const server = Bun.serve({
				hostname: "127.0.0.1",
				port: 0,
				fetch: (request) => {
					const { pathname } = new URL(request.url);
					return Response.json({
						path: pathname,
						version: pathname === "/api/cases" ? caseVersion : 1,
					});
				},
			});
			try {
				const endpoint = path(server.url.href);
				const baseline = await benchmark(server.url.href, [], endpoint);
				expect(baseline.code).toBe(0);
				const file = join(directory, "baseline.json");
				await writeFile(file, baseline.stdout);
				caseVersion = 2;
				const changed = await benchmark(
					server.url.href,
					["--baseline", file],
					endpoint,
				);
				expect(changed.code).toBe(1);
				expect(changed.stderr).toContain(
					`${endpoint}: API data changed or was unstable`,
				);
			} finally {
				await server.stop(true);
				await rm(directory, { recursive: true, force: true });
			}
		});
	}

	it("returns success for a baseline and failure when the API data changes", async () => {
		const directory = await mkdtemp(
			join(tmpdir(), "rehearse-loading-benchmark-"),
		);
		let version = 1;
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch: (request) =>
				Response.json({ path: new URL(request.url).pathname, version }),
		});
		try {
			const baseline = await benchmark(server.url.href);
			expect(baseline.code).toBe(0);
			const report = loadingBenchmarkSchema.parse(JSON.parse(baseline.stdout));
			expect(report.startup).toHaveLength(5);
			expect(report.endpoints.map(({ path }) => path)).toEqual([
				"/api/run-listing",
			]);
			const file = join(directory, "baseline.json");
			await writeFile(file, baseline.stdout);
			version = 2;
			const changed = await benchmark(server.url.href, ["--baseline", file]);
			expect(changed.code).toBe(1);
			expect(changed.stderr).toContain("API data changed or was unstable");
		} finally {
			await server.stop(true);
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("rejects an API path answered by the HTML fallback", async () => {
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch: () =>
				new Response("<html>not an API</html>", {
					headers: { "Content-Type": "text/html" },
				}),
		});
		try {
			const result = await benchmark(server.url.href);
			expect(result.code).toBe(1);
			expect(result.stderr).toContain(
				"expected JSON; check that the API route exists",
			);
		} finally {
			await server.stop(true);
		}
	});
});
