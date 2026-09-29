import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
	directorySource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import { storeSpendCeiling } from "#benchmark/settings";
import { createAppServer } from "./app";
import { FakeLauncher } from "./launch-test-support";

const runHistoryResponseSchema = z.object({ rows: z.array(z.unknown()) });

const PORT = 4173;
const LOOPBACK = { host: `127.0.0.1:${String(PORT)}` };

describe(createAppServer.name, () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
		);
	});

	async function corpusDirectory(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-app-corpus-"));
		roots.push(root);
		await Bun.write(join(root, "CLAUDE.md"), "the instructions\n");

		return root;
	}

	async function runsDirectory(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-app-runs-"));
		roots.push(root);

		return root;
	}

	async function clientDistDirectory(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-app-dist-"));
		roots.push(root);
		await mkdir(join(root, "assets"), { recursive: true });
		await Bun.write(
			join(root, "index.html"),
			"<!doctype html><title>rehearse</title>",
		);
		await Bun.write(join(root, "assets", "app.js"), "console.log('app');");

		return root;
	}

	interface AppServer {
		readonly app: ReturnType<typeof createAppServer>;
		readonly launcher: FakeLauncher;
	}

	async function appServer(): Promise<AppServer> {
		const records = await runsDirectory();
		await storeSpendCeiling(records, 5);
		const launcher = new FakeLauncher();
		const app = createAppServer({
			runsDirectory: records,
			liveness: nothingRunning,
			corpusSource: directorySource(await corpusDirectory()),
			clientDistDirectory: await clientDistDirectory(),
			port: PORT,
			casesRoot: await casesDirectory(),
			launcher,
		});

		return { app, launcher };
	}

	async function casesDirectory(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-app-cases-"));
		roots.push(root);
		await mkdir(join(root, "smoke"), { recursive: true });
		await Bun.write(
			join(root, "smoke", "case.json"),
			JSON.stringify({
				id: "smoke",
				kind: "session",
				title: "Smoke",
				prompt: "Reply OK.",
				tools: [],
				corpusFiles: [],
				checks: [{ kind: "word-band", max: 1 }],
				model: "sonnet",
			}),
		);

		return root;
	}

	it("serves the API under /api", async () => {
		const { app } = await appServer();

		const response = await app.request("/api/runs", { headers: LOOPBACK });
		const body = runHistoryResponseSchema.parse(await response.json());

		expect(response.status).toBe(200);
		expect(body.rows).toEqual([]);
	});

	it("serves a built client asset by path", async () => {
		const { app } = await appServer();

		const response = await app.request("/assets/app.js", { headers: LOOPBACK });
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(body).toContain("console.log");
	});

	it("falls back to index.html for a client-side route the router owns", async () => {
		const { app } = await appServer();

		const response = await app.request("/some/router/path", {
			headers: LOOPBACK,
		});
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(body).toContain("rehearse");
	});

	it("forbids every other site from framing the client", async () => {
		const { app } = await appServer();

		const response = await app.request("/", { headers: LOOPBACK });

		expect(response.headers.get("x-frame-options")).toBe("DENY");
		expect(response.headers.get("content-security-policy")).toBe(
			"frame-ancestors 'none'",
		);
	});

	describe("when the Host is not the loopback address it serves on", () => {
		it.each([
			["a rebound DNS name", `rebound.example:${String(PORT)}`],
			["another port", "127.0.0.1:9999"],
			["no port", "localhost"],
		])("refuses a GET from %s", async (_label, host) => {
			const { app } = await appServer();

			const response = await app.request("/api/runs", { headers: { host } });

			expect(response.status).toBe(403);
		});

		it("serves localhost on the same port", async () => {
			const { app } = await appServer();

			const response = await app.request("/api/runs", {
				headers: { host: `localhost:${String(PORT)}` },
			});

			expect(response.status).toBe(200);
		});
	});

	describe("when a request writes", () => {
		const origin = `http://127.0.0.1:${String(PORT)}`;
		const sameOrigin = {
			...LOOPBACK,
			origin,
			"content-type": "application/json",
			"sec-fetch-site": "same-origin",
		};

		it("passes a same-origin JSON request on to the routes", async () => {
			const { app } = await appServer();

			const response = await app.request("/api/no-such-route", {
				method: "POST",
				headers: sameOrigin,
				body: "{}",
			});

			expect(response.status).not.toBe(403);
		});

		it("answers a write to a route that does not exist 404, not with the client page", async () => {
			const { app } = await appServer();

			const response = await app.request("/api/no-such-route", {
				method: "POST",
				headers: sameOrigin,
				body: "{}",
			});

			expect(response.status).toBe(404);
		});

		it.each([
			["a foreign Origin", { ...sameOrigin, origin: "https://evil.example" }],
			[
				"an Origin on another port",
				{ ...sameOrigin, origin: "http://127.0.0.1:9999" },
			],
			["no Origin", { ...LOOPBACK, "content-type": "application/json" }],
			["a cross-site fetch", { ...sameOrigin, "sec-fetch-site": "cross-site" }],
			["a form body", { ...sameOrigin, "content-type": "text/plain" }],
			[
				"a urlencoded body",
				{
					...sameOrigin,
					"content-type": "application/x-www-form-urlencoded",
				},
			],
		])("refuses %s", async (_label, headers) => {
			const { app } = await appServer();

			const response = await app.request("/api/no-such-route", {
				method: "POST",
				headers,
				body: "{}",
			});

			expect(response.status).toBe(403);
		});
		describe("to launch a run", () => {
			const launch = JSON.stringify({
				kind: "case",
				caseId: "smoke",
				attempts: 1,
			});

			it("starts the launch a same-origin JSON request asks for", async () => {
				const { app, launcher } = await appServer();

				const response = await app.request("/api/launches", {
					method: "POST",
					headers: sameOrigin,
					body: launch,
				});

				expect(response.status).toBe(202);
				expect(launcher.launches).toHaveLength(1);
			});

			it.each([
				["a foreign Origin", { ...sameOrigin, origin: "https://evil.example" }],
				[
					"a rebound Host",
					{ ...sameOrigin, host: `rebound.example:${String(PORT)}` },
				],
				["a form body", { ...sameOrigin, "content-type": "text/plain" }],
			])("starts nothing for %s", async (_label, headers) => {
				const { app, launcher } = await appServer();

				const response = await app.request("/api/launches", {
					method: "POST",
					headers,
					body: launch,
				});

				expect(response.status).toBe(403);
				expect(launcher.launches).toEqual([]);
			});
		});
	});
});
