import { describe, expect, it } from "bun:test";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import { captureStageCorpus, stageCorpusRoots } from "./checkpoint";
import { writeFixtureFiles } from "./checkpoint-filesystem-test-fixture";
import {
	installedCorpus,
	replaceLayoutWithLink,
} from "./checkpoint-linked-corpus-test-fixture";
import { SymlinkedEntryError } from "./file-presence";
import { TestResources } from "./test-support";

const resources = TestResources.forEachTest();

async function testRetainsHashesAndLayoutNamesForAPermittedBackingDirectoryAndCrossLayoutAlias(): Promise<void> {
	const source = await installedCorpus(resources);
	await writeFixtureFiles({
		files: [
			["agents/review.md", "review"],
			["agents/alias.md", "build skill"],
		],
		root: source.root,
	});

	const ordinary = await captureStageCorpus("build", "instructions", [source]);
	await rm(join(source.root, "agents"), { recursive: true });
	await writeFile(join(source.backingRoot, "review.md"), "review");
	await symlink(
		join(source.root, "skills", "build", "SKILL.md"),
		join(source.backingRoot, "alias.md"),
	);
	await symlink(source.backingRoot, join(source.root, "agents"));

	const linked = await captureStageCorpus("build", "instructions", [source]);

	expect(linked).toEqual(ordinary);
}

async function testRefusesSBeyondTheDeclaredBackingTree(
	layoutPath: string,
): Promise<void> {
	const source = await installedCorpus(resources);
	const outside = `${source.backingRoot}-private`;
	await replaceLayoutWithLink({
		files: [["undisclosed.md", "private contents"]],
		layoutPath,
		outside,
		source,
	});

	const failure = await failureOf(
		captureStageCorpus("build", "instructions", [source]),
	);

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
	expect(failure.message).toContain(layoutPath);
	expect(failure.message).not.toContain(outside);
	expect(failure.message).not.toContain("undisclosed.md");
	expect(failure.message).not.toContain("private contents");
}

async function testRefusesASkillReachedThroughAnEscapingSkillsParent(): Promise<void> {
	const source = await installedCorpus(resources);
	const outside = join(dirname(source.root), "outside");
	await mkdir(join(outside, "build"), { recursive: true });
	await writeFile(join(outside, "build", "SKILL.md"), "foreign skill");
	await rm(join(source.root, "skills"), { recursive: true });
	await symlink(outside, join(source.root, "skills"));

	const failure = await failureOf(
		captureStageCorpus("build", "instructions", [source]),
	);

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
	expect(failure.message).toContain("skills/build");
}

async function testRefusesAnEscapingNestedDirectoryUnderAnAllowedLinkedRoot(): Promise<void> {
	const source = await installedCorpus(resources);
	const outside = join(dirname(source.root), "outside");
	await mkdir(outside);
	await writeFile(join(outside, "secret.md"), "private contents");
	await symlink(outside, join(source.backingRoot, "escape"));
	await symlink(source.backingRoot, join(source.root, "agents"));

	const failure = await failureOf(
		captureStageCorpus("build", "instructions", [source]),
	);

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
	expect(failure.message).toContain("agents/escape");
	expect(failure.message).not.toContain("secret.md");
}

async function testRefusesAProjectEscapeInsteadOfFallingThroughOrBorrowingLivePermission(): Promise<void> {
	const source = await installedCorpus(resources);
	const target = join(dirname(source.root), "target");
	await mkdir(join(target, ".claude"), { recursive: true });
	await writeFile(join(source.backingRoot, "review.md"), "review");
	await symlink(source.backingRoot, join(target, ".claude", "agents"));
	await symlink(source.backingRoot, join(source.root, "agents"));

	const failure = await failureOf(
		captureStageCorpus(
			"build",
			"instructions",
			stageCorpusRoots(source, target),
		),
	);

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
	expect(failure.message).toContain("agents");
}

describe(captureStageCorpus.name, () => {
	it(
		"retains hashes and layout names for a permitted backing directory and cross-layout alias",
		testRetainsHashesAndLayoutNamesForAPermittedBackingDirectoryAndCrossLayoutAlias,
	);
	describe("when a selected directory leaves its source", () => {
		it.each(["agents", "output-styles", "rulebook", "skills/build"])(
			"refuses %s beyond the declared backing tree",
			testRefusesSBeyondTheDeclaredBackingTree,
		);
		it(
			"refuses a skill reached through an escaping skills parent",
			testRefusesASkillReachedThroughAnEscapingSkillsParent,
		);
		it(
			"refuses an escaping nested directory under an allowed linked root",
			testRefusesAnEscapingNestedDirectoryUnderAnAllowedLinkedRoot,
		);
		it(
			"refuses a project escape instead of falling through or borrowing live permission",
			testRefusesAProjectEscapeInsteadOfFallingThroughOrBorrowingLivePermission,
		);
	});
});
