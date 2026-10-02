import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
	directorySource,
	fixedCorpusSource,
	nothingRunning,
	NO_PROVIDER_PROJECTS,
} from "#benchmark/run-records-test-support";
import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import { liveCorpusSource } from "#benchmark/corpus-file";
import { linkedCorpusSource } from "#benchmark/corpus-source";
import { UNLINK_CORPUS_COMMAND, storeSpendCeiling } from "#benchmark/settings";
import { createAppServer } from "./app";
import { FakeLauncher } from "./launch-test-support";

const runHistoryResponseSchema = z.object({ rows: z.array(z.unknown()) });

const launchedSchema = z.object({ id: z.string() });

const corpusResponseSchema = z.object({
	root: z.string(),
	digest: z.string(),
});

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
		readonly liveRoot: string;
		readonly casesRoot: string;
	}

	/**
	 * A server whose corpus is one fixed directory, or one that reads the
	 * linked corpus on every request the way the served app does, with a
	 * temporary directory standing in for the live install.
	 */
	async function appServer(
		corpus: "fixed" | "linked" = "fixed",
	): Promise<AppServer> {
		const records = await runsDirectory();
		await storeSpendCeiling(records, 5);
		const launcher = new FakeLauncher();
		const fixed = directorySource(await corpusDirectory());
		const live = liveCorpusSource({
			root: await corpusDirectory(),
			backingRoot: await corpusDirectory(),
		});
		const cases = await casesDirectory();
		const app = createAppServer({
			projectsDirectory: NO_PROVIDER_PROJECTS,
			runsDirectory: records,
			liveness: nothingRunning,
			readCorpusSource:
				corpus === "fixed"
					? fixedCorpusSource(fixed)
					: () => linkedCorpusSource(records, () => live),
			clientDistDirectory: await clientDistDirectory(),
			port: PORT,
			casesRoot: cases,
			launcher,
		});

		return { app, launcher, liveRoot: live.root, casesRoot: cases };
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

		it("judges a browser that sends no Sec-Fetch-Site on the rest alone", async () => {
			const { app } = await appServer();
			const { "sec-fetch-site": _fetchSite, ...withoutFetchSite } = sameOrigin;

			const response = await app.request("/api/no-such-route", {
				method: "POST",
				headers: withoutFetchSite,
				body: "{}",
			});

			expect(response.status).toBe(404);
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
			["a same-site fetch", { ...sameOrigin, "sec-fetch-site": "same-site" }],
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

		describe("to link a corpus directory", () => {
			interface LinkedServer {
				readonly corpusReading: () => Promise<
					z.infer<typeof corpusResponseSchema>
				>;
				readonly changeLink: (
					method: "PUT" | "DELETE",
					body: Readonly<Record<string, string>>,
					headers?: Readonly<Record<string, string>>,
				) => Promise<Response>;
				readonly read: (path: string) => Promise<Response>;
				readonly store: (
					body: Readonly<{ usd: number }>,
					headers?: Readonly<Record<string, string>>,
				) => Promise<Response>;
				readonly liveRoot: string;
			}

			async function linkedServer(): Promise<LinkedServer> {
				const { app, liveRoot } = await appServer("linked");

				return {
					liveRoot,
					corpusReading: async () => {
						const response = await app.request("/api/corpus", {
							headers: LOOPBACK,
						});

						return corpusResponseSchema.parse(await response.json());
					},
					changeLink: (method, body, headers = sameOrigin) =>
						Promise.resolve(
							app.request("/api/settings/corpus", {
								method,
								headers,
								body: JSON.stringify(body),
							}),
						),
					read: (path) =>
						Promise.resolve(app.request(path, { headers: LOOPBACK })),
					store: (body, headers = sameOrigin) =>
						Promise.resolve(
							app.request("/api/settings/spend-ceiling", {
								method: "PUT",
								headers,
								body: JSON.stringify(body),
							}),
						),
				};
			}

			it("measures the linked directory from the next read on", async () => {
				const { corpusReading, changeLink } = await linkedServer();
				const first = await corpusDirectory();
				const second = await corpusDirectory();
				await Bun.write(join(second, "CLAUDE.md"), "other instructions\n");
				await changeLink("PUT", { directory: first });
				const before = await corpusReading();

				const linked = await changeLink("PUT", { directory: second });
				const after = await corpusReading();

				expect(linked.status).toBe(200);
				expect(before.root).toBe(first);
				expect(after.root).toBe(second);
				expect(corpusVersionLabel(after.digest)).not.toBe(
					corpusVersionLabel(before.digest),
				);
			});

			it("returns to the live install once unlinked", async () => {
				const { corpusReading, changeLink, liveRoot } = await linkedServer();
				await changeLink("PUT", { directory: await corpusDirectory() });

				const unlinked = await changeLink("DELETE", {});
				const reading = await corpusReading();

				expect(unlinked.status).toBe(200);
				expect(reading.root).toBe(liveRoot);
			});

			describe("from a foreign Origin", () => {
				const foreign = { ...sameOrigin, origin: "https://evil.example" };

				it("links nothing", async () => {
					const { corpusReading, changeLink, liveRoot } = await linkedServer();

					const response = await changeLink(
						"PUT",
						{ directory: await corpusDirectory() },
						foreign,
					);
					const reading = await corpusReading();

					expect(response.status).toBe(403);
					expect(reading.root).toBe(liveRoot);
				});

				it("unlinks nothing", async () => {
					const { corpusReading, changeLink } = await linkedServer();
					const directory = await corpusDirectory();
					await changeLink("PUT", { directory });

					const response = await changeLink("DELETE", {}, foreign);
					const reading = await corpusReading();

					expect(response.status).toBe(403);
					expect(reading.root).toBe(directory);
				});

				it("stores no ceiling", async () => {
					const { store, read } = await linkedServer();

					const response = await store({ usd: 9 }, foreign);
					const reading = await read("/api/settings");

					expect(response.status).toBe(403);
					expect(await reading.json()).toMatchObject({ spendCeilingUsd: 5 });
				});
			});

			describe("once the linked directory is gone", () => {
				async function vanishedLink(): Promise<{
					readonly server: LinkedServer;
					readonly directory: string;
				}> {
					const server = await linkedServer();
					const directory = await corpusDirectory();
					await server.changeLink("PUT", { directory });
					await rm(directory, { recursive: true });

					return { server, directory };
				}

				it.each(["/api/runs", "/api/corpus", "/api/corpus/versions"])(
					"refuses %s naming the command that unlinks it",
					async (path) => {
						const { server } = await vanishedLink();

						const response = await server.read(path);

						expect(response.status).toBe(409);
						expect(await response.text()).toContain(UNLINK_CORPUS_COMMAND);
					},
				);

				it("still reads the settings, naming the directory that is linked", async () => {
					const { server, directory } = await vanishedLink();

					const response = await server.read("/api/settings");

					expect(response.status).toBe(200);
					expect(await response.json()).toMatchObject({
						linkedCorpus: { kind: "directory", root: directory },
					});
				});

				it("stores a ceiling and answers that it did", async () => {
					const { server } = await vanishedLink();

					const response = await server.store({ usd: 3 });

					expect(response.status).toBe(200);
					expect(await response.json()).toMatchObject({ spendCeilingUsd: 3 });
				});
			});
		});

		describe("to declare a case", () => {
			const declaration = JSON.stringify({
				id: "declared",
				kind: "session",
				title: "Declared",
				prompt: "Reply OK.",
				tools: [],
				corpusFiles: [],
				checks: [{ kind: "word-band", max: 1 }],
				model: "sonnet",
			});

			it("declares the case a same-origin JSON request asks for", async () => {
				const { app, casesRoot } = await appServer();

				const response = await app.request("/api/cases", {
					method: "POST",
					headers: sameOrigin,
					body: declaration,
				});

				expect(response.status).toBe(201);
				expect(await readdir(casesRoot)).toContain("declared");
			});

			it("writes no case directory for a foreign Origin", async () => {
				const { app, casesRoot } = await appServer();

				const response = await app.request("/api/cases", {
					method: "POST",
					headers: { ...sameOrigin, origin: "https://evil.example" },
					body: declaration,
				});

				expect(response.status).toBe(403);
				expect(await readdir(casesRoot)).toEqual(["smoke"]);
			});
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

			it("stops nothing for a foreign Origin", async () => {
				const { app, launcher } = await appServer();
				const started = await app.request("/api/launches", {
					method: "POST",
					headers: sameOrigin,
					body: launch,
				});
				const { id } = launchedSchema.parse(await started.json());

				const response = await app.request(`/api/launches/${id}/stop`, {
					method: "POST",
					headers: { ...sameOrigin, origin: "https://evil.example" },
					body: "{}",
				});

				expect(response.status).toBe(403);
				expect(launcher.stopped).toEqual([]);
			});
		});
	});
});
