import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
	directorySource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import { createAppServer } from "./app";

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

	it("serves the API under /api", async () => {
		const app = createAppServer({
			runsDirectory: await runsDirectory(),
			liveness: nothingRunning,
			corpusSource: directorySource(await corpusDirectory()),
			clientDistDirectory: await clientDistDirectory(),
			port: PORT,
		});

		const response = await app.request("/api/runs", { headers: LOOPBACK });
		const body = runHistoryResponseSchema.parse(await response.json());

		expect(response.status).toBe(200);
		expect(body.rows).toEqual([]);
	});

	it("serves a built client asset by path", async () => {
		const app = createAppServer({
			runsDirectory: await runsDirectory(),
			liveness: nothingRunning,
			corpusSource: directorySource(await corpusDirectory()),
			clientDistDirectory: await clientDistDirectory(),
			port: PORT,
		});

		const response = await app.request("/assets/app.js", { headers: LOOPBACK });
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(body).toContain("console.log");
	});

	it("falls back to index.html for a client-side route the router owns", async () => {
		const app = createAppServer({
			runsDirectory: await runsDirectory(),
			liveness: nothingRunning,
			corpusSource: directorySource(await corpusDirectory()),
			clientDistDirectory: await clientDistDirectory(),
			port: PORT,
		});

		const response = await app.request("/some/router/path", {
			headers: LOOPBACK,
		});
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(body).toContain("rehearse");
	});

	describe("when the Host is not the loopback address it serves on", () => {
		it.each([
			["a rebound DNS name", `rebound.example:${String(PORT)}`],
			["another port", "127.0.0.1:9999"],
			["no port", "localhost"],
		])("refuses a GET from %s", async (_label, host) => {
			const app = createAppServer({
				runsDirectory: await runsDirectory(),
				liveness: nothingRunning,
				corpusSource: directorySource(await corpusDirectory()),
				clientDistDirectory: await clientDistDirectory(),
				port: PORT,
			});

			const response = await app.request("/api/runs", { headers: { host } });

			expect(response.status).toBe(403);
		});

		it("serves localhost on the same port", async () => {
			const app = createAppServer({
				runsDirectory: await runsDirectory(),
				liveness: nothingRunning,
				corpusSource: directorySource(await corpusDirectory()),
				clientDistDirectory: await clientDistDirectory(),
				port: PORT,
			});

			const response = await app.request("/api/runs", {
				headers: { host: `localhost:${String(PORT)}` },
			});

			expect(response.status).toBe(200);
		});
	});
});
