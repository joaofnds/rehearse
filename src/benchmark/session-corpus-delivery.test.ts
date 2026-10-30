import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { resolveCorpusSource } from "#benchmark/corpus-source";
import type { HomePathCitationMap } from "#benchmark/home-path-citation";
import {
	freezeWholeSessionCorpus,
	installSessionCorpusSnapshot,
	snapshotSessionCorpus,
} from "#benchmark/session-corpus";

import { directoryCorpus, resources } from "./session-corpus-test-fixtures";

resources.registerCleanup();

const citations: HomePathCitationMap = {
	home: "/home/user",
	roots: [
		{ layoutPath: "rulebook", path: "/home/user/.agents/rulebook" },
		{ layoutPath: "skills", path: "/home/user/.agents/skills" },
		{ layoutPath: "rulebook", path: "/home/user/.claude/rulebook" },
		{ layoutPath: "skills", path: "/home/user/.claude/skills" },
	],
};

const AUTHORED_INSTRUCTIONS = [
	"Read ~/.agents/rulebook/ownership.md and list ~/.agents/rulebook/.",
	"Load $HOME/.claude/skills/x/SKILL.md, then ~/.agents/skills/y/SKILL.md.",
	"Config lives in ~/.agents/backlog-config.yml.",
	"",
].join("\n");

const DELIVERED_INSTRUCTIONS = [
	"Read .claude/rulebook/ownership.md and list .claude/rulebook/.",
	"Load .claude/skills/x/SKILL.md, then .claude/skills/y/SKILL.md.",
	"Config lives in ~/.agents/backlog-config.yml.",
	"",
].join("\n");

async function citingCorpus(): Promise<string> {
	return await directoryCorpus({
		"CLAUDE.md": AUTHORED_INSTRUCTIONS,
		"rulebook/ownership.md": "the arm's rule\n",
		"skills/x/SKILL.md": "the arm's skill\n",
	});
}

/**
 * A whole corpus holds every layout directory, so a skill the arm lacks is
 * missed in the arm's copy rather than read from the user's install.
 */
async function redirectsCitationsOfHeldFilesAndLeavesTheRestAsWritten(): Promise<void> {
	const snapshot = await freezeWholeSessionCorpus(
		await resolveCorpusSource(await citingCorpus()),
		join(await resources.createControlDirectory(), "corpus"),
		[],
	);
	const attemptDirectory = await resources.createControlDirectory();

	const { delivery } = await installSessionCorpusSnapshot(
		snapshot,
		attemptDirectory,
		citations,
	);

	expect(
		await Bun.file(join(attemptDirectory, ".claude/CLAUDE.md")).text(),
	).toBe(DELIVERED_INSTRUCTIONS);
	expect(delivery).toEqual({ redirected: 4, rule: 1 });
	expect(await Bun.file(join(snapshot.root, "CLAUDE.md")).text()).toBe(
		AUTHORED_INSTRUCTIONS,
	);
}

/**
 * A declared rulebook file alone holds neither the skill the instructions
 * cite nor the whole rulebook, so those citations still reach the user's
 * live install.
 */
async function redirectsOnlyWhatADeclaredSnapshotInstalls(): Promise<void> {
	const snapshot = await snapshotSessionCorpus(
		await resolveCorpusSource(await citingCorpus()),
		join(await resources.createControlDirectory(), "corpus"),
		["CLAUDE.md", "rulebook/ownership.md"],
	);
	const attemptDirectory = await resources.createControlDirectory();

	const { delivery } = await installSessionCorpusSnapshot(
		snapshot,
		attemptDirectory,
		citations,
	);

	expect(
		await Bun.file(join(attemptDirectory, ".claude/CLAUDE.md")).text(),
	).toBe(
		[
			"Read .claude/rulebook/ownership.md and list ~/.agents/rulebook/.",
			"Load $HOME/.claude/skills/x/SKILL.md, then ~/.agents/skills/y/SKILL.md.",
			"Config lives in ~/.agents/backlog-config.yml.",
			"",
		].join("\n"),
	);
	expect(delivery).toEqual({ redirected: 1, rule: 1 });
}

async function copiesAFileThatIsNotTextAsItIs(): Promise<void> {
	const bytes = Buffer.from("fffe7e2f2e2e", "hex");
	const root = await citingCorpus();
	await Bun.write(join(root, "skills/x/icon.bin"), bytes);
	const snapshot = await freezeWholeSessionCorpus(
		await resolveCorpusSource(root),
		join(await resources.createControlDirectory(), "corpus"),
		[],
	);
	const attemptDirectory = await resources.createControlDirectory();

	await installSessionCorpusSnapshot(snapshot, attemptDirectory, citations);

	expect(
		await Bun.file(join(attemptDirectory, ".claude/skills/x/icon.bin")).bytes(),
	).toEqual(bytes);
}

describe(installSessionCorpusSnapshot.name, () => {
	it(
		"redirects citations of held files and leaves the rest as written",
		redirectsCitationsOfHeldFilesAndLeavesTheRestAsWritten,
	);

	it(
		"redirects only what a declared snapshot installs",
		redirectsOnlyWhatADeclaredSnapshotInstalls,
	);

	it("copies a file that is not text as it is", copiesAFileThatIsNotTextAsItIs);
});
