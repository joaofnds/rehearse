import { describe, expect, it } from "bun:test";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import { hashDirectory, hashWorkflowState } from "./checkpoint";
import {
	temporaryDirectory,
	writeFixtureFiles,
} from "./checkpoint-filesystem-test-fixture";
import { SymlinkedEntryError } from "./file-presence";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

async function testRefusesATargetWhoseBacklogTreeIsItselfASymlinkRatherThanHashingWhatItPointsAt(): Promise<void> {
	const parent = await temporaryDirectory(
		testResources,
		"rehearse-workflow-state-",
	);
	const outside = join(parent, "outside");
	await writeFixtureFiles({
		files: [["control.key", "secret bytes"]],
		root: outside,
	});
	const target = join(parent, "target");
	await mkdir(target);
	await symlink(outside, join(target, "backlog"));

	const failure = await failureOf(hashWorkflowState(target));

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
	expect(failure.message).toContain("backlog");
}

async function testRefusesATargetWhoseBacklogTreeHoldsASymlinkRatherThanHashingWhatItPointsAt(): Promise<void> {
	const parent = await temporaryDirectory(
		testResources,
		"rehearse-workflow-state-",
	);
	const outside = join(parent, "outside");
	await writeFixtureFiles({
		files: [["control.key", "secret bytes"]],
		root: outside,
	});
	const target = join(parent, "target");
	await writeFixtureFiles({
		files: [["backlog/board.md", "board"]],
		root: target,
	});
	await symlink(outside, join(target, "backlog", "escape"));

	const failure = await failureOf(hashWorkflowState(target));

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
	expect(failure.message).toContain("escape");
}

async function testHashesAFileReachedThroughALinkThatResolvesBackInsideTheWalkedTree(): Promise<void> {
	const parent = await temporaryDirectory(
		testResources,
		"rehearse-hash-directory-",
	);
	const root = join(parent, "corpus");
	await mkdir(join(root, "build"), { recursive: true });
	await writeFile(join(root, "build", "SKILL.md"), "real skill");
	await symlink(
		join(root, "build", "SKILL.md"),
		join(root, "build", "ALIAS.md"),
	);

	const hashed = await hashDirectory(root, "skills", {
		rootMayBeALink: false,
	});

	expect(hashed.map(({ path }) => path)).toEqual([
		"skills/build/ALIAS.md",
		"skills/build/SKILL.md",
	]);
}

async function testHashesTheFilesUnderARootThatIsItselfASymlink(): Promise<void> {
	const parent = await temporaryDirectory(
		testResources,
		"rehearse-hash-directory-",
	);
	const real = join(parent, "real");
	await mkdir(real);
	await writeFile(join(real, "CLAUDE.md"), "instructions");
	await symlink(real, join(parent, "link"));

	const files = await hashDirectory(join(parent, "link"), "", {
		rootMayBeALink: true,
	});

	expect(files).toEqual([
		{
			path: "CLAUDE.md",
			sha256:
				"238fa28a94976c7da14563bc873c2729bd5cd325389085bb4c6dd0de28923590",
		},
	]);
}

async function testThrowsSymlinkedEntryErrorNamingTheEntryWithoutTheTargetSBytes(): Promise<void> {
	const parent = await temporaryDirectory(
		testResources,
		"rehearse-hash-directory-",
	);
	const outside = join(parent, "outside");
	await writeFixtureFiles({
		files: [["control.key", "secret bytes"]],
		root: outside,
	});
	const walked = join(parent, "walked");
	await writeFixtureFiles({
		files: [["CLAUDE.md", "instructions"]],
		root: walked,
	});
	await symlink(outside, join(walked, "evil"));

	const failure = await failureOf(
		hashDirectory(walked, "", { rootMayBeALink: true }),
	);

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
	expect(failure.message).toContain("evil");
	expect(failure.message).not.toContain("secret bytes");
}

async function testThrowsForALinkWhoseTargetIsGoneWhichStatAloneReportsAsAMissingEntry(): Promise<void> {
	const directory = await temporaryDirectory(
		testResources,
		"rehearse-hash-directory-",
	);
	await writeFile(join(directory, "CLAUDE.md"), "instructions");
	await symlink(
		join(directory, "does-not-exist"),
		join(directory, "broken-link"),
	);

	const failure = await failureOf(
		hashDirectory(directory, "", { rootMayBeALink: true }),
	);

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
	expect(failure.message).toContain("broken-link");
}

async function testSaysTheTargetIsMissingForALinkThatNeverLeftTheTreeRatherThanAccusingItOfResolvingOutside(): Promise<void> {
	const directory = await temporaryDirectory(
		testResources,
		"rehearse-hash-directory-",
	);
	await symlink(join(directory, "gone.md"), join(directory, "dangle.md"));

	const failure = await failureOf(
		hashDirectory(directory, "agents", { rootMayBeALink: true }),
	);

	expect(failure.message).toBe(
		"agents/dangle.md is a link whose target is missing, so the bytes it names cannot be read",
	);
}

describe(hashWorkflowState.name, () => {
	it(
		"refuses a target whose backlog tree is itself a symlink, rather than hashing what it points at",
		testRefusesATargetWhoseBacklogTreeIsItselfASymlinkRatherThanHashingWhatItPointsAt,
	);
	it(
		"refuses a target whose backlog tree holds a symlink, rather than hashing what it points at",
		testRefusesATargetWhoseBacklogTreeHoldsASymlinkRatherThanHashingWhatItPointsAt,
	);
});

describe(hashDirectory.name, () => {
	it(
		"hashes a file reached through a link that resolves back inside the walked tree",
		testHashesAFileReachedThroughALinkThatResolvesBackInsideTheWalkedTree,
	);
	it(
		"hashes the files under a root that is itself a symlink",
		testHashesTheFilesUnderARootThatIsItselfASymlink,
	);
	describe("when the walk lists an entry that is a symlink", () => {
		it(
			"throws SymlinkedEntryError naming the entry, without the target's bytes",
			testThrowsSymlinkedEntryErrorNamingTheEntryWithoutTheTargetSBytes,
		);
		it(
			"throws for a link whose target is gone, which stat alone reports as a missing entry",
			testThrowsForALinkWhoseTargetIsGoneWhichStatAloneReportsAsAMissingEntry,
		);
		it(
			"says the target is missing for a link that never left the tree, rather than accusing it of resolving outside",
			testSaysTheTargetIsMissingForALinkThatNeverLeftTheTreeRatherThanAccusingItOfResolvingOutside,
		);
	});
});
