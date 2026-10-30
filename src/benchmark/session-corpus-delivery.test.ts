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
	"Load .claude/skills/x/SKILL.md, then ~/.agents/skills/y/SKILL.md.",
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
	expect(delivery).toEqual({ redirected: 3, rule: 1 });
	expect(await Bun.file(join(snapshot.root, "CLAUDE.md")).text()).toBe(
		AUTHORED_INSTRUCTIONS,
	);
}

/**
 * A declared rulebook file alone does not hold the skill the instructions
 * cite, so that citation still reaches the user's live skill.
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
		DELIVERED_INSTRUCTIONS.replace(
			".claude/skills/x/SKILL.md",
			"$HOME/.claude/skills/x/SKILL.md",
		),
	);
	expect(delivery).toEqual({ redirected: 2, rule: 1 });
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
