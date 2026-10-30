import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { installStageCorpusSnapshot } from "./checkpoint";
import { writeFixtureFiles } from "./checkpoint-filesystem-test-fixture";
import type { HomePathCitationMap } from "./home-path-citation";
import { TestResources } from "./test-support";

const resources = TestResources.forEachTest();

const citations: HomePathCitationMap = {
	home: "/home/user",
	roots: [
		{ layoutPath: "rulebook", path: "/home/user/.agents/rulebook" },
		{ layoutPath: "skills", path: "/home/user/.agents/skills" },
	],
};

const AUTHORED_INSTRUCTIONS = [
	"Read ~/.agents/rulebook/ownership.md.",
	"Load ~/.agents/skills/shape/SKILL.md, then ~/.agents/skills/delivery/SKILL.md.",
	"",
].join("\n");

/**
 * A stage snapshot holds the stage's own skill, so a citation of another
 * skill reaches the user's live one, as the actual setup would.
 */
async function redirectsCitationsOfWhatTheStageInstallHolds(): Promise<void> {
	const snapshot = await resources.createControlDirectory();
	await writeFixtureFiles({
		files: [
			["CLAUDE.md", AUTHORED_INSTRUCTIONS],
			["rulebook/ownership.md", "the arm's rule\n"],
			["skills/shape/SKILL.md", "See ~/.agents/rulebook/.\n"],
		],
		root: snapshot,
	});
	const target = await resources.createControlDirectory();

	const delivery = await installStageCorpusSnapshot(
		snapshot,
		target,
		citations,
	);

	expect(await Bun.file(join(target, ".claude/CLAUDE.md")).text()).toBe(
		[
			"Read .claude/rulebook/ownership.md.",
			"Load .claude/skills/shape/SKILL.md, then ~/.agents/skills/delivery/SKILL.md.",
			"",
		].join("\n"),
	);
	expect(
		await Bun.file(join(target, ".claude/skills/shape/SKILL.md")).text(),
	).toBe("See .claude/rulebook/.\n");
	expect(delivery).toEqual({ redirected: 3, rule: 1 });
	expect(await Bun.file(join(snapshot, "CLAUDE.md")).text()).toBe(
		AUTHORED_INSTRUCTIONS,
	);
}

describe("installing a stage corpus whose text cites its files by home path", () => {
	it(
		"redirects citations of what the stage install holds",
		redirectsCitationsOfWhatTheStageInstallHolds,
	);
});
