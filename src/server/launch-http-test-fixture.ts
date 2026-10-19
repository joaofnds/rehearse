import { chmod, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import { storeSpendCeiling } from "#benchmark/settings";
import {
	INACCESSIBLE_PERMISSIONS,
	PRIVATE_DIRECTORY_PERMISSIONS,
} from "#server/file-permissions-test-support";
import LaunchHttpDriver from "#server/launch-http-test-driver";
import type { LaunchServerContext } from "#server/launch-http-test-driver";
import { directoryLiveCorpus } from "#server/launch-test-support";

import CaseCatalogExamples from "./case-catalog-test-examples";

async function replayableRun(runsDirectory: string): Promise<string> {
	const fixture = new RecordedRunsFixture(runsDirectory);
	await fixture.write();
	await fixture.pipeline.writeInitialCheckpoint();

	return fixture.replayableRun;
}

async function recordedRunWithCheckpoint(
	runsDirectory: string,
	initialCheckpoint: "recorded" | "missing",
): Promise<string> {
	const fixture = new RecordedRunsFixture(runsDirectory);
	await fixture.write();
	if (initialCheckpoint === "recorded") {
		await fixture.pipeline.writeInitialCheckpoint();
	}

	return fixture.replayableRun;
}

async function caseDirectories(root: string): Promise<string[]> {
	const entries = await readdir(root);

	return entries.toSorted((left, right) => left.localeCompare(right));
}

/** The live install the harness serves, present on disk. */
async function liveRoot(runsDirectory: string): Promise<string> {
	const { root } = directoryLiveCorpus(runsDirectory);
	await Bun.write(join(root, "CLAUDE.md"), "live\n");

	return root;
}

async function runningRun(runsDirectory: string): Promise<string> {
	const fixture = new RecordedRunsFixture(runsDirectory);
	await fixture.events.writeRunningRun();

	return fixture.runningRun;
}

const NOTHING_RUNNING: LaunchServerContext["liveness"] = {
	isAlive: () => false,
	readMarker: async () => {
		await Promise.try((): undefined => undefined);
	},
};

const launchedSchema = z.object({ id: z.string() });

const refusalSchema = z.object({ error: z.string() });

const {
	pipeline: PIPELINE_CASE,
	session: SESSION_CASE,
	unmodelled: UNMODELLED_CASE,
} = CaseCatalogExamples.launches();

/** Recorded on disk, and its declaration does not parse. */
const BROKEN_CASE = { id: "broken-case" };

const RESOURCE_DRAIN_START_INDEX = 0;

interface LinkedLaunchCorpus {
	readonly driver: LaunchHttpDriver;
	readonly directory: string;
}

class LaunchFixture {
	readonly #roots: string[] = [];
	readonly #locked: string[] = [];

	public readonly temporaryDirectory = async (
		prefix: string,
	): Promise<string> => {
		const root = await mkdtemp(join(tmpdir(), prefix));
		this.#roots.push(root);

		return root;
	};

	public readonly casesRoot = async (
		declarations: readonly { readonly id: string }[],
	): Promise<string> => {
		const root = await this.temporaryDirectory("rehearse-launch-cases-");
		await Array.fromAsync(declarations, async (declaration) => {
			await mkdir(join(root, declaration.id), { recursive: true });
			await Bun.write(
				join(root, declaration.id, "case.json"),
				JSON.stringify(declaration),
			);
		});

		return root;
	};

	public readonly harness = async (
		ceiling: "stored" | "missing" = "stored",
		liveness: LaunchServerContext["liveness"] = NOTHING_RUNNING,
	): Promise<LaunchHttpDriver> => {
		const runsDirectory = await this.temporaryDirectory(
			"rehearse-launch-runs-",
		);
		if (ceiling === "stored") {
			const storedCeilingUsd = 5;

			await storeSpendCeiling(runsDirectory, storedCeilingUsd);
		}

		return new LaunchHttpDriver({
			casesRoot: await this.casesRoot([
				PIPELINE_CASE,
				SESSION_CASE,
				UNMODELLED_CASE,
				BROKEN_CASE,
			]),
			liveness,
			runsDirectory,
		});
	};

	public readonly corpusDirectory = async (): Promise<string> => {
		const corpus = await this.temporaryDirectory("rehearse-settings-corpus-");
		await Bun.write(join(corpus, "CLAUDE.md"), "linked\n");

		return corpus;
	};

	public async linkedCorpus(): Promise<LinkedLaunchCorpus> {
		const driver = await this.harness();
		const directory = await this.corpusDirectory();
		await driver.send("PUT", "/api/settings/corpus", { directory });

		return { directory, driver };
	}

	public async outsideDirectoryWithFile(fileName: string): Promise<string> {
		const outside = await this.temporaryDirectory("rehearse-outside-");
		await Bun.write(join(outside, fileName), "outside\n");

		return outside;
	}

	public async lockDirectory(path: string): Promise<void> {
		await mkdir(path);
		await chmod(path, INACCESSIBLE_PERMISSIONS);
		this.#locked.push(path);
	}

	public async dispose(): Promise<void> {
		await Promise.all(
			this.#locked.map(async (path) => {
				await chmod(path, PRIVATE_DIRECTORY_PERMISSIONS);
			}),
		);

		await Promise.all(
			this.#roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
				await rm(root, { force: true, recursive: true });
			}),
		);
	}
}

export {
	LaunchFixture,
	PIPELINE_CASE,
	UNMODELLED_CASE,
	BROKEN_CASE,
	SESSION_CASE,
	NOTHING_RUNNING,
	launchedSchema,
	refusalSchema,
	replayableRun,
	recordedRunWithCheckpoint,
	caseDirectories,
	liveRoot,
	runningRun,
};
