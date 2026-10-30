import { describe, expect, it } from "bun:test";
import { lstat, mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
	freezeWholeSessionCorpus,
	installSessionCorpusSnapshot,
} from "#benchmark/session-corpus";

import {
	directoryCorpus,
	noCitations,
	resources,
	twoStyleCorpus,
} from "./session-corpus-test-fixtures";

resources.registerCleanup();

async function snapshotsEveryCorpusFileDeclaredOrNot(): Promise<void> {
	const prepared = await twoStyleCorpus();

	const snapshot = await freezeWholeSessionCorpus(
		prepared.source,
		prepared.destination,
		["output-styles/brief.md"],
	);

	expect(
		await Bun.file(join(snapshot.root, "output-styles/aardvark.md")).text(),
	).toBe("an undeclared style\n");
	expect(await Bun.file(join(snapshot.root, "agents/rogue.md")).text()).toBe(
		"an undeclared agent\n",
	);
}

/**
 * The live arm of a comparison is the user's whole install, so a case that
 * declares no corpus file still carries every instruction file the user
 * holds, copied through the links into the backing tree.
 */
async function copiesTheWholeLiveCorpusWhenTheCaseDeclaresNoCorpusFile(): Promise<void> {
	const backingRoot = await directoryCorpus({
		"skills/probe/SKILL.md": "backing skill\n",
	});
	const root = await directoryCorpus({ "CLAUDE.md": "live instructions\n" });
	await symlink(join(backingRoot, "skills"), join(root, "skills"));
	const destination = join(await resources.createControlDirectory(), "corpus");

	const snapshot = await freezeWholeSessionCorpus(
		{ backingRoot, kind: "live", root },
		destination,
		[],
	);

	expect(snapshot).toMatchObject({
		kind: "directory",
		origin: { kind: "live" },
		root: destination,
	});
	expect(await Bun.file(join(destination, "CLAUDE.md")).text()).toBe(
		"live instructions\n",
	);
	expect(
		await Bun.file(join(destination, "skills/probe/SKILL.md")).text(),
	).toBe("backing skill\n");
}

/**
 * `~/.claude` also holds credentials and settings, so a corpus file linked to
 * one of them would carry its bytes into the records and the attempt.
 */
async function refusesALiveCorpusFileLinkedOutsideTheLayout(): Promise<void> {
	const backingRoot = await directoryCorpus({ "AGENTS.md": "instructions\n" });
	const root = await directoryCorpus({ "agents/real.md": "real agent\n" });
	await writeFile(join(root, ".credentials.json"), "secret\n");
	await symlink(join(root, ".credentials.json"), join(root, "agents/leak.md"));
	await symlink(join(backingRoot, "AGENTS.md"), join(root, "CLAUDE.md"));
	const destination = join(await resources.createControlDirectory(), "corpus");

	const snapshot = freezeWholeSessionCorpus(
		{ backingRoot, kind: "live", root },
		destination,
		[],
	);

	expect(snapshot).rejects.toThrow(
		"Corpus entry agents/leak.md resolves outside the live corpus extent",
	);
}

async function copiesTheLiveInstructionsLinkedIntoTheBackingTree(): Promise<void> {
	const backingRoot = await directoryCorpus({ "AGENTS.md": "instructions\n" });
	const root = await directoryCorpus({ "agents/real.md": "real agent\n" });
	await symlink(join(backingRoot, "AGENTS.md"), join(root, "CLAUDE.md"));
	const destination = join(await resources.createControlDirectory(), "corpus");

	await freezeWholeSessionCorpus(
		{ backingRoot, kind: "live", root },
		destination,
		[],
	);

	expect(await Bun.file(join(destination, "CLAUDE.md")).text()).toBe(
		"instructions\n",
	);
}

/**
 * A frozen corpus must not change when its source does, so a link inside a
 * corpus directory is frozen as the bytes it reaches.
 */
async function freezesTheBytesALinkInACorpusDirectoryReaches(): Promise<void> {
	const root = await directoryCorpus({
		"skills/probe/SKILL.md": "frozen skill\n",
	});
	await mkdir(join(root, "skills/probe/references"), { recursive: true });
	await symlink("../SKILL.md", join(root, "skills/probe/references/copy.md"));
	const destination = join(await resources.createControlDirectory(), "corpus");
	const snapshot = await freezeWholeSessionCorpus(
		{ kind: "directory", root },
		destination,
		[],
	);

	await writeFile(join(root, "skills/probe/SKILL.md"), "edited skill\n");

	const frozen = join(snapshot.root, "skills/probe/references/copy.md");
	const frozenStats = await lstat(frozen);
	expect(frozenStats.isSymbolicLink()).toBe(false);
	expect(await Bun.file(frozen).text()).toBe("frozen skill\n");
}

async function installsEveryFileTheSnapshotCarries(): Promise<void> {
	const prepared = await twoStyleCorpus();
	const snapshot = await freezeWholeSessionCorpus(
		prepared.source,
		prepared.destination,
		["output-styles/brief.md"],
	);
	const attemptDirectory = await resources.createControlDirectory();

	const { installed } = await installSessionCorpusSnapshot(
		snapshot,
		attemptDirectory,
		noCitations,
	);

	expect(installed.toSorted()).toEqual([
		"agents/rogue.md",
		"output-styles/aardvark.md",
		"output-styles/brief.md",
	]);
	expect(
		await Bun.file(join(attemptDirectory, ".claude/agents/rogue.md")).text(),
	).toBe("an undeclared agent\n");
}

/**
 * A fixture or target can carry its own `.claude` files, and copying the corpus
 * over them would leave a session reading bytes neither side wrote.
 */
async function refusesToInstallOverAFileTheAttemptAlreadyHolds(): Promise<void> {
	const prepared = await twoStyleCorpus();
	const snapshot = await freezeWholeSessionCorpus(
		prepared.source,
		prepared.destination,
		["output-styles/brief.md"],
	);
	const attemptDirectory = await directoryCorpus({
		".claude/agents/rogue.md": "the fixture's agent\n",
	});

	const installed = installSessionCorpusSnapshot(
		snapshot,
		attemptDirectory,
		noCitations,
	);

	expect(installed).rejects.toThrow(
		"Corpus file agents/rogue.md would overwrite the attempt's own .claude/agents/rogue.md",
	);
}

describe(freezeWholeSessionCorpus.name, () => {
	it(
		"snapshots every corpus file, declared or not",
		snapshotsEveryCorpusFileDeclaredOrNot,
	);

	it(
		"copies the whole live corpus when the case declares no corpus file",
		copiesTheWholeLiveCorpusWhenTheCaseDeclaresNoCorpusFile,
	);

	it(
		"refuses a live corpus file linked outside the corpus layout",
		refusesALiveCorpusFileLinkedOutsideTheLayout,
	);

	it(
		"copies the live instructions linked into the backing tree",
		copiesTheLiveInstructionsLinkedIntoTheBackingTree,
	);

	it(
		"freezes the bytes a link in a corpus directory reaches",
		freezesTheBytesALinkInACorpusDirectoryReaches,
	);

	it(
		"refuses to install over a file the attempt already holds",
		refusesToInstallOverAFileTheAttemptAlreadyHolds,
	);

	it(
		"installs every file the snapshot carries",
		installsEveryFileTheSnapshotCarries,
	);
});
