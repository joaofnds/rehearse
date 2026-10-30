import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import {
	installStageCorpusSnapshot,
	planStageCorpusDelivery,
} from "./checkpoint";
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
 * A stage snapshot holds the stage's own skill and every rule, so a citation
 * of another skill reaches the user's live one, as the actual setup would.
 */
async function citingSnapshot(): Promise<string> {
	const snapshot = await resources.createControlDirectory();
	await writeFixtureFiles({
		files: [
			["CLAUDE.md", AUTHORED_INSTRUCTIONS],
			["rulebook/ownership.md", "the arm's rule\n"],
			["skills/shape/SKILL.md", "See ~/.agents/rulebook/.\n"],
		],
		root: snapshot,
	});

	return snapshot;
}

async function redirectsCitationsOfWhatTheStageInstallHolds(): Promise<void> {
	const snapshot = await citingSnapshot();
	const target = await resources.createControlDirectory();

	const delivery = await installStageCorpusSnapshot(snapshot, target, {
		citations,
		skill: "shape",
	});

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

async function plansWhatAnInstallWouldDeliverWithoutWriting(): Promise<void> {
	const snapshot = await citingSnapshot();

	const planned = await planStageCorpusDelivery(snapshot, {
		citations,
		skill: "shape",
	});

	expect(planned).toEqual({
		delivery: { redirected: 3, rule: 1 },
		held: ["CLAUDE.md", "agents", "output-styles", "rulebook", "skills/shape"],
	});
	expect(await Bun.file(join(snapshot, "CLAUDE.md")).text()).toBe(
		AUTHORED_INSTRUCTIONS,
	);
}

async function holdsTheStagesOwnSkillWhenTheSnapshotLacksIt(): Promise<void> {
	const snapshot = await resources.createControlDirectory();
	await writeFixtureFiles({
		files: [["CLAUDE.md", AUTHORED_INSTRUCTIONS]],
		root: snapshot,
	});
	const target = await resources.createControlDirectory();

	await installStageCorpusSnapshot(snapshot, target, {
		citations,
		skill: "shape",
	});

	expect(await Bun.file(join(target, ".claude/CLAUDE.md")).text()).toBe(
		[
			"Read .claude/rulebook/ownership.md.",
			"Load .claude/skills/shape/SKILL.md, then ~/.agents/skills/delivery/SKILL.md.",
			"",
		].join("\n"),
	);
	const planned = await planStageCorpusDelivery(snapshot, {
		citations,
		skill: "shape",
	});
	expect(planned.held).toContain("skills/shape");
}

describe("installing a stage corpus whose text cites its files by home path", () => {
	it(
		"redirects citations of what the stage install holds",
		redirectsCitationsOfWhatTheStageInstallHolds,
	);

	it(
		"plans what an install would deliver without writing",
		plansWhatAnInstallWouldDeliverWithoutWriting,
	);

	it(
		"holds the stage's own skill when the snapshot lacks it",
		holdsTheStagesOwnSkillWhenTheSnapshotLacksIt,
	);
});
