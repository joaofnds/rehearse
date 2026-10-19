import { describe, expect, it } from "bun:test";
import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";

import { resolveCorpusSource } from "#benchmark/corpus-source";
import {
	SessionCorpusError,
	snapshotSessionCorpus,
} from "#benchmark/session-corpus";
import { failureOf } from "#cli/cli-test-support";

import { directoryCorpus, resources } from "./session-corpus-test-fixtures";

resources.registerCleanup();

/**
 * The live extent is the whole install, so a link inside a declared skill
 * directory can resolve to `~/.claude/.credentials.json` or a saved transcript
 * and still be contained. Those bytes are not corpus, and a live copy
 * dereferences, so containment alone would carry them into the run directory
 * and into a confirmation group's frozen-input digests.
 */
async function refusesALinkInsideADeclaredLiveSkillDirectoryThatLeavesTheCorpusLayout(): Promise<void> {
	const root = await resources.createControlDirectory();
	const backingRoot = await resources.createControlDirectory();
	await Bun.write(join(root, ".credentials.json"), "SECRET\n");
	await Bun.write(join(root, "skills/x/SKILL.md"), "skill body\n");
	await symlink(join(root, ".credentials.json"), join(root, "skills/x/creds"));

	const corpusDestination = join(
		await resources.createControlDirectory(),
		"corpus",
	);

	const failure = await failureOf(
		snapshotSessionCorpus(
			{ backingRoot, kind: "live", root },
			corpusDestination,
			["skills/x/SKILL.md"],
		),
	);

	expect(failure).toBeInstanceOf(SessionCorpusError);
	expect(failure.message).toContain("skills/x/creds");
}

async function refusesALiveDeclaredFileThatResolvesOutsideTheInstallAndItsBackingTree(): Promise<void> {
	const outside = await directoryCorpus({
		"output-styles/foreign.md": "FOREIGN STYLE\n",
	});
	const root = await resources.createControlDirectory();
	const backingRoot = await resources.createControlDirectory();
	await mkdir(join(root, "output-styles"), { recursive: true });
	await symlink(
		join(outside, "output-styles", "foreign.md"),
		join(root, "output-styles", "foreign.md"),
	);
	const corpusDestination = join(
		await resources.createControlDirectory(),
		"corpus",
	);

	const failure = await failureOf(
		snapshotSessionCorpus(
			{ backingRoot, kind: "live", root },
			corpusDestination,
			["output-styles/foreign.md"],
		),
	);

	expect(failure).toBeInstanceOf(SessionCorpusError);
	expect(failure.message).toContain("output-styles/foreign.md");
}

/**
 * A recursive copy dereferences, so a symlinked corpus entry pulls in bytes
 * from outside the source: the harness would hash and install whatever the
 * link points at while the record says it snapshotted a source. Refusing is
 * the precedent ACT-26.5 set for a fixture holding a symlink.
 */
async function refusesASymlinkedCorpusEntryNamingTheEntry(): Promise<void> {
	const outside = await directoryCorpus({
		"output-styles/brief.md": "the live style\n",
	});
	const root = await resources.createControlDirectory();
	await mkdir(join(root, "output-styles"), { recursive: true });
	await symlink(
		join(outside, "output-styles/brief.md"),
		join(root, "output-styles/evil.md"),
	);
	const destination = await resources.createControlDirectory();

	const failure = await failureOf(
		snapshotSessionCorpus(
			await resolveCorpusSource(root),
			join(destination, "corpus"),
			["output-styles/evil.md"],
		),
	);

	expect(failure).toBeInstanceOf(SessionCorpusError);
	expect(failure.message).toContain("output-styles/evil.md");
}

async function refusesASymlinkInsideADeclaredSkillDirectory(): Promise<void> {
	const outside = await directoryCorpus({ "secret.md": "outside bytes\n" });
	const root = await resources.createControlDirectory();
	await mkdir(join(root, "output-styles"), { recursive: true });
	await Bun.write(join(root, "agents/reviewer.md"), "an agent\n");
	await mkdir(join(root, "output-styles/nested"), { recursive: true });
	await symlink(
		join(outside, "secret.md"),
		join(root, "output-styles/nested/leak.md"),
	);
	const destination = await resources.createControlDirectory();

	const failure = await failureOf(
		snapshotSessionCorpus(
			await resolveCorpusSource(root),
			join(destination, "corpus"),
			["output-styles/nested"],
		),
	);

	expect(failure).toBeInstanceOf(SessionCorpusError);
	expect(failure.message).toContain("leak.md");
}

async function refusesADeclaredFileReachedThroughALayoutDirectoryThatIsItselfASymlink(): Promise<void> {
	const outside = await resources.createControlDirectory();
	await Bun.write(join(outside, "agents/reviewer.md"), "OUTSIDE AGENT\n");
	const root = await resources.createControlDirectory();
	await Bun.write(join(root, "CLAUDE.md"), "variant instructions\n");
	await symlink(join(outside, "agents"), join(root, "agents"));
	const destination = await resources.createControlDirectory();

	const failure = await failureOf(
		snapshotSessionCorpus(
			await resolveCorpusSource(root),
			join(destination, "corpus"),
			["agents/reviewer.md"],
		),
	);

	expect(failure).toBeInstanceOf(SessionCorpusError);
	expect(failure.message).toContain("agents/reviewer.md");
	expect(failure.message).not.toContain("OUTSIDE AGENT");
}

describe(snapshotSessionCorpus.name, () => {
	it(
		"refuses a link inside a declared live skill directory that leaves the corpus layout",
		refusesALinkInsideADeclaredLiveSkillDirectoryThatLeavesTheCorpusLayout,
	);

	it(
		"refuses a live declared file that resolves outside the install and its backing tree",
		refusesALiveDeclaredFileThatResolvesOutsideTheInstallAndItsBackingTree,
	);

	it(
		"refuses a symlinked corpus entry, naming the entry",
		refusesASymlinkedCorpusEntryNamingTheEntry,
	);

	it(
		"refuses a symlink inside a declared skill directory",
		refusesASymlinkInsideADeclaredSkillDirectory,
	);

	it(
		"refuses a declared file reached through a layout directory that is itself a symlink",
		refusesADeclaredFileReachedThroughALayoutDirectoryThatIsItselfASymlink,
	);
});
