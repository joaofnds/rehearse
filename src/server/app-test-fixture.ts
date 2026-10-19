import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { liveCorpusSource } from "#benchmark/corpus-file";
import { linkedCorpusSource } from "#benchmark/corpus-source";
import {
	NO_PROVIDER_PROJECTS,
	directorySource,
	fixedCorpusSource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import { storeSpendCeiling } from "#benchmark/settings";

import createAppServer from "./app";
import AppHttpDriver, {
	port as PORT,
	corpusResponseSchema,
	sameOrigin,
} from "./app-test-driver";
import type { CorpusReading } from "./app-test-driver";
import { FAKE_LAUNCH_TIME, FakeLauncher } from "./launch-test-support";

const RESOURCE_DRAIN_START_INDEX = 0;

const roots: string[] = [];

async function corpusDirectory(
	instructions = "the instructions\n",
): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-app-corpus-"));
	roots.push(root);
	await Bun.write(join(root, "CLAUDE.md"), instructions);

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
	readonly driver: AppHttpDriver;
	readonly launcher: FakeLauncher;
	readonly liveRoot: string;
	readonly casesRoot: string;
	readonly runsRoot: string;
}

/**
 * A server whose corpus is one fixed directory, or one that reads the
 * linked corpus on every request the way the served app does, with a
 * temporary directory standing in for the live install.
 */
async function appServer(
	corpus: "fixed" | "linked" = "fixed",
): Promise<AppServer> {
	const storedCeilingUsd = 5;

	const records = await runsDirectory();
	await storeSpendCeiling(records, storedCeilingUsd);
	const launcher = new FakeLauncher();
	const fixed = directorySource(await corpusDirectory());
	const live = liveCorpusSource({
		backingRoot: await corpusDirectory(),
		root: await corpusDirectory(),
	});
	const cases = await casesDirectory();
	const app = createAppServer({
		casesRoot: cases,
		clientDistDirectory: await clientDistDirectory(),
		home: records,
		launcher,
		liveCorpus: () => live,
		liveness: nothingRunning,
		now: () => new Date(FAKE_LAUNCH_TIME),
		port: PORT,
		projectsDirectory: NO_PROVIDER_PROJECTS,
		readCorpusSource:
			corpus === "fixed"
				? fixedCorpusSource(fixed)
				: async () => await linkedCorpusSource(records, () => live),
		runsDirectory: records,
	});

	return {
		casesRoot: cases,
		driver: new AppHttpDriver(app),
		launcher,
		liveRoot: live.root,
		runsRoot: records,
	};
}

async function casesDirectory(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-app-cases-"));
	roots.push(root);
	await mkdir(join(root, "smoke"), { recursive: true });
	await Bun.write(
		join(root, "smoke", "case.json"),
		JSON.stringify({
			checks: [{ kind: "word-band", max: 1 }],
			corpusFiles: [],
			id: "smoke",
			kind: "session",
			model: "sonnet",
			prompt: "Reply OK.",
			title: "Smoke",
			tools: [],
		}),
	);

	return root;
}

interface LinkedServer {
	readonly corpusReading: () => Promise<CorpusReading>;
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
	const { driver, liveRoot } = await appServer("linked");

	return {
		changeLink: async (method, body, headers = sameOrigin) =>
			await Promise.resolve(
				driver.writeJson({
					body,
					headers,
					method,
					path: "/api/settings/corpus",
				}),
			),
		corpusReading: async () => {
			const response = await driver.read("/api/corpus");

			return corpusResponseSchema.parse(await response.json());
		},
		liveRoot,
		read: async (path) => await Promise.resolve(driver.read(path)),
		store: async (body, headers = sameOrigin) =>
			await Promise.resolve(
				driver.writeJson({
					body,
					headers,
					method: "PUT",
					path: "/api/settings/spend-ceiling",
				}),
			),
	};
}

async function vanishedLink(): Promise<{
	readonly server: LinkedServer;
	readonly directory: string;
}> {
	const server = await linkedServer();
	const directory = await corpusDirectory();
	await server.changeLink("PUT", { directory });
	await rm(directory, { recursive: true });

	return { directory, server };
}

async function clearAppRoots(): Promise<void> {
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

export {
	corpusDirectory,
	appServer,
	linkedServer,
	vanishedLink,
	clearAppRoots,
};

export type { AppServer };

export {
	port as PORT,
	loopback as LOOPBACK,
	sameOrigin,
	corpusResponseSchema,
} from "./app-test-driver";
