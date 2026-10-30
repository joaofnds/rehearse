import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import {
	deliversCorpusFile,
	installSessionCorpusSnapshot,
	snapshotSessionCorpus,
	snapshotStyleName,
} from "#benchmark/session-corpus";

import {
	directoryCorpus,
	resources,
	twoStyleCorpus,
} from "./session-corpus-test-fixtures";

resources.registerCleanup();

/**
 * Alphabetical order picked the style before, so a corpus holding a second
 * style ran the attempt against one the case never named while recording the
 * declared one's digest in lineage.
 */
async function selectsTheStyleTheCaseDeclaredNotTheFirstOneInTheSnapshot(): Promise<void> {
	const prepared = await twoStyleCorpus();
	const snapshot = await snapshotSessionCorpus(
		prepared.source,
		prepared.destination,
		["output-styles/brief.md"],
	);

	expect(snapshotStyleName(snapshot)).toBe("brief");
}

async function selectsNoStyleWhenTheCaseDeclaresNone(): Promise<void> {
	const prepared = await twoStyleCorpus();
	const snapshot = await snapshotSessionCorpus(
		prepared.source,
		prepared.destination,
		["agents/reviewer.md"],
	);

	expect(snapshotStyleName(snapshot)).toBeUndefined();
}

/**
 * The selection rule has to hold on the snapshot alone: a snapshot can carry
 * a style the case did not declare, and alphabetical order would pick that
 * one while lineage recorded the declared style's digest.
 */
async function selectsTheDeclaredStyleFromASnapshotHoldingOneThatSortsBeforeIt(): Promise<void> {
	const root = await directoryCorpus({
		"output-styles/aardvark.md": "an undeclared style\n",
		"output-styles/brief.md": "the declared style\n",
	});

	expect(
		snapshotStyleName({
			declaredPaths: ["output-styles/brief.md"],
			kind: "directory",
			origin: { kind: "directory", source: root },
			root,
			scope: "declared",
		}),
	).toBe("brief");
}

async function installsOnlyTheFilesTheCaseDeclared(): Promise<void> {
	const prepared = await twoStyleCorpus();
	const snapshot = await snapshotSessionCorpus(
		prepared.source,
		prepared.destination,
		["output-styles/brief.md"],
	);
	const attemptDirectory = await resources.createControlDirectory();

	await installSessionCorpusSnapshot(snapshot, attemptDirectory);

	expect(
		await Bun.file(
			join(attemptDirectory, ".claude/output-styles/brief.md"),
		).text(),
	).toBe("the declared style\n");
	expect(
		await Bun.file(
			join(attemptDirectory, ".claude/output-styles/aardvark.md"),
		).exists(),
	).toBe(false);
	expect(
		await Bun.file(join(attemptDirectory, ".claude/agents/rogue.md")).exists(),
	).toBe(false);
}

/**
 * The overlay's scope has to hold on the snapshot alone: what reaches the
 * session is what the case declared, not everything the snapshot directory
 * happens to carry.
 */
async function installsTheDeclaredFileFromASnapshotCarryingAnUndeclaredOne(): Promise<void> {
	const root = await directoryCorpus({
		"agents/rogue.md": "an undeclared agent\n",
		"output-styles/aardvark.md": "an undeclared style\n",
		"output-styles/brief.md": "the declared style\n",
	});
	const attemptDirectory = await resources.createControlDirectory();

	await installSessionCorpusSnapshot(
		{
			declaredPaths: ["output-styles/brief.md"],
			kind: "directory",
			origin: { kind: "directory", source: root },
			root,
			scope: "declared",
		},
		attemptDirectory,
	);

	expect(
		await Bun.file(
			join(attemptDirectory, ".claude/output-styles/brief.md"),
		).text(),
	).toBe("the declared style\n");
	expect(
		await Bun.file(
			join(attemptDirectory, ".claude/output-styles/aardvark.md"),
		).exists(),
	).toBe(false);
	expect(
		await Bun.file(join(attemptDirectory, ".claude/agents/rogue.md")).exists(),
	).toBe(false);
}

async function snapshotsOnlyTheFilesTheCaseDeclared(): Promise<void> {
	const prepared = await twoStyleCorpus();
	const snapshot = await snapshotSessionCorpus(
		prepared.source,
		prepared.destination,
		["output-styles/brief.md"],
	);

	expect(
		await Bun.file(join(snapshot.root, "output-styles/aardvark.md")).exists(),
	).toBe(false);
	expect(await Bun.file(join(snapshot.root, "agents/rogue.md")).exists()).toBe(
		false,
	);
}

describe("selecting the style and scoping the overlay to what the case declared", () => {
	it(
		"selects the style the case declared, not the first one in the snapshot",
		selectsTheStyleTheCaseDeclaredNotTheFirstOneInTheSnapshot,
	);

	it(
		"selects no style when the case declares none",
		selectsNoStyleWhenTheCaseDeclaresNone,
	);

	it(
		"selects the declared style from a snapshot holding one that sorts before it",
		selectsTheDeclaredStyleFromASnapshotHoldingOneThatSortsBeforeIt,
	);

	it(
		"installs only the files the case declared",
		installsOnlyTheFilesTheCaseDeclared,
	);

	it(
		"installs the declared file from a snapshot carrying an undeclared one",
		installsTheDeclaredFileFromASnapshotCarryingAnUndeclaredOne,
	);

	it(
		"snapshots only the files the case declared",
		snapshotsOnlyTheFilesTheCaseDeclared,
	);
});

describe(deliversCorpusFile.name, () => {
	const declared = [
		"output-styles/brief.md",
		"rulebook/coding-style/core.md",
		"skills/probe/SKILL.md",
	];
	it.each([
		{ file: "a declared file", path: "output-styles/brief.md" },
		{
			file: "a file beside a declared skill",
			path: "skills/probe/references/notes.md",
		},
	])("delivers $file", ({ path }) => {
		expect(deliversCorpusFile(declared, path)).toBe(true);
	});

	it.each([
		{
			file: "a file beside a declared output style",
			path: "output-styles/other.md",
		},
		{
			file: "a file beside a declared rulebook file",
			path: "rulebook/coding-style/go.md",
		},
		{ file: "another skill", path: "skills/other/SKILL.md" },
		{
			file: "a skill whose name extends a declared one",
			path: "skills/probe-old/SKILL.md",
		},
	])("refuses $file", ({ path }) => {
		expect(deliversCorpusFile(declared, path)).toBe(false);
	});
});
