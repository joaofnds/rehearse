import { describe, expect, it } from "bun:test";
import { symlink } from "node:fs/promises";
import { join } from "node:path";

import {
	freezeWholeSessionCorpus,
	installSessionCorpusSnapshot,
} from "#benchmark/session-corpus";

import {
	directoryCorpus,
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

async function installsEveryFileTheSnapshotCarries(): Promise<void> {
	const prepared = await twoStyleCorpus();
	const snapshot = await freezeWholeSessionCorpus(
		prepared.source,
		prepared.destination,
		["output-styles/brief.md"],
	);
	const attemptDirectory = await resources.createControlDirectory();

	const installed = await installSessionCorpusSnapshot(
		snapshot,
		attemptDirectory,
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
		"installs every file the snapshot carries",
		installsEveryFileTheSnapshotCarries,
	);
});
