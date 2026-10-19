import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { LiveCorpusRoot } from "#benchmark/corpus-file";
import { linkCorpus, linkedCorpusSource } from "#benchmark/corpus-source";
import type { RunLiveness } from "#benchmark/run-liveness";
import {
	NO_PROVIDER_PROJECTS,
	RecordedRunsFixture,
	directorySource,
	liveStageSettings,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import type { CorpusEditDriver } from "#server/corpus-edit-test-driver";
import { corpusEditDriver } from "#server/corpus-edit-test-driver";

import createAppServer from "./app";
import {
	FAKE_LAUNCH_TIME,
	FakeLauncher,
	directoryLiveCorpus,
} from "./launch-test-support";

const RESOURCE_DRAIN_START_INDEX = 0;

/** The directories the live install's roots link to. */
interface Installed {
	readonly root: string;
	readonly backingRoot: string;
}

type Paths = Readonly<Pick<Served, "corpus" | "runsDirectory">>;

interface Served {
	readonly driver: CorpusEditDriver;
	readonly corpus: string;
	readonly runsDirectory: string;
	readonly fixture: RecordedRunsFixture;
	readonly launcher: FakeLauncher;
	/** Holds the live install and the directories its roots link to. */
	readonly liveDirectory: string;
	readonly installed: Installed;
}

/**
 * A live install whose roots are links into a directory of its own, as
 * the live instructions are on an operator's machine, so only a guard
 * that resolves the live roots sees a write that reaches them.
 */
async function liveInstall(
	directory: string,
): Promise<readonly [LiveCorpusRoot, Installed]> {
	const live = directoryLiveCorpus(directory);
	const installed = {
		backingRoot: join(directory, "installed", ".agents"),
		root: join(directory, "installed", ".claude"),
	};
	await mkdir(dirname(live.root), { recursive: true });
	await Array.fromAsync(
		[
			[live.root, installed.root],
			[live.backingRoot, installed.backingRoot],
		] as const,
		async ([root, target]) => {
			await mkdir(target, { recursive: true });
			await writeFile(join(target, "CLAUDE.md"), "live instructions\n");
			await symlink(target, root);
		},
	);

	return [live, installed];
}

async function editedFromDisk(served: Paths): Promise<void> {
	await writeFile(
		join(served.corpus, "skills", "discuss", "SKILL.md"),
		"discuss, edited elsewhere\n",
	);
}

const PORT = 4174;

const roots: string[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), prefix));
	roots.push(root);

	return root;
}

async function corpusDirectory(): Promise<string> {
	const root = await temporaryDirectory("rehearse-corpus-edit-");
	await mkdir(join(root, "skills", "build"), { recursive: true });
	await mkdir(join(root, "skills", "discuss"), { recursive: true });
	await writeFile(join(root, "CLAUDE.md"), "instructions\n");
	await writeFile(join(root, "skills", "build", "SKILL.md"), "build skill\n");
	await writeFile(
		join(root, "skills", "discuss", "SKILL.md"),
		"discuss skill\n",
	);

	return root;
}

/**
 * The served app over a linked directory, a run whose stages read it at a
 * logged version, and a live install of its own, so no test reaches the
 * real one.
 */
async function serving(
	liveness: RunLiveness = nothingRunning,
): Promise<Served> {
	const runsDirectory = await temporaryDirectory("rehearse-corpus-edit-runs-");
	const corpus = await corpusDirectory();
	const liveDirectory = await temporaryDirectory("rehearse-corpus-edit-live-");
	const [live, installed] = await liveInstall(liveDirectory);
	const fixture = await recordedEditHistory(runsDirectory, corpus);
	await linkCorpus(runsDirectory, corpus);
	const launcher = new FakeLauncher();
	const app = createAppServer({
		casesRoot: await temporaryDirectory("rehearse-corpus-edit-cases-"),
		clientDistDirectory: await temporaryDirectory("rehearse-corpus-edit-dist-"),
		home: runsDirectory,
		launcher,
		liveCorpus: () => live,
		liveness,
		now: () => new Date(FAKE_LAUNCH_TIME),
		port: PORT,
		projectsDirectory: NO_PROVIDER_PROJECTS,
		readCorpusSource: async () =>
			await linkedCorpusSource(runsDirectory, () => live),
		runsDirectory,
	});
	const host = `127.0.0.1:${String(PORT)}`;

	return {
		corpus,
		driver: corpusEditDriver(app, host),
		fixture,
		installed,
		launcher,
		liveDirectory,
		runsDirectory,
	};
}

type LiveSetup = Readonly<
	Pick<Served, "runsDirectory" | "liveDirectory" | "installed">
>;

/** Links a directory reached through a link to the given target. */
async function linkThrough(served: LiveSetup, target: string): Promise<void> {
	const link = join(
		await temporaryDirectory("rehearse-corpus-edit-link-"),
		"corpus",
	);
	await symlink(target, link);
	await linkCorpus(served.runsDirectory, link);
}

async function servingEscape(): Promise<Served> {
	const served = await serving();
	await mkdir(join(served.corpus, "agents"));
	await symlink(
		join(served.installed.root, "CLAUDE.md"),
		join(served.corpus, "agents", "escape.md"),
	);

	return served;
}

async function servingEmptied(): Promise<Served> {
	const served = await serving();
	await rm(served.corpus, { recursive: true });

	return served;
}

async function clearCorpusEditRoots(): Promise<void> {
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

async function recordedEditHistory(
	runsDirectory: string,
	corpus: string,
): Promise<RecordedRunsFixture> {
	const fixture = new RecordedRunsFixture(runsDirectory, {
		settingsFile: await liveStageSettings(),
	});
	await fixture.write();
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));
	await fixture.corpus.recordVersionFrom(directorySource(corpus));
	await fixture.pipeline.writeInitialCheckpoint();

	return fixture;
}

async function linkedSkill(corpus: string): Promise<string> {
	await mkdir(join(corpus, "skills", "shared"));
	await writeFile(join(corpus, "skills", "shared", "SKILL.md"), "shared\n");
	const linked = join(corpus, "skills", "discuss", "SKILL.md");
	await rm(linked);
	await symlink(join("..", "shared", "SKILL.md"), linked);

	return linked;
}

export {
	linkedSkill,
	editedFromDisk,
	temporaryDirectory,
	serving,
	linkThrough,
	servingEscape,
	servingEmptied,
	clearCorpusEditRoots,
};

export type { LiveSetup, Served, Paths };
