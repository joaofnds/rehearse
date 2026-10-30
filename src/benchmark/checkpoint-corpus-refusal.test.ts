import { describe, expect, it } from "bun:test";
import { symlink } from "node:fs/promises";
import { join } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import { captureStageCorpus, installStageCorpusSnapshot } from "./checkpoint";
import {
	corpusSources,
	escapingSnapshotFixture,
} from "./checkpoint-corpus-test-fixture";
import {
	noCitations,
	temporaryDirectory,
	writeFixtureFiles,
} from "./checkpoint-filesystem-test-fixture";
import { SymlinkedEntryError } from "./file-presence";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

async function testRefusesALayoutRootOutsideTheCorpusWithoutNamingItsDescendants(): Promise<void> {
	const parent = await temporaryDirectory(
		testResources,
		"rehearse-layout-root-",
	);
	const root = join(parent, "corpus");
	await writeFixtureFiles({
		files: [
			["corpus/skills/build/SKILL.md", "build"],
			["private-project/secret.md", "foreign contents"],
		],
		root: parent,
	});
	await symlink(join(parent, "private-project"), join(root, "agents"));

	const failure = await failureOf(
		captureStageCorpus("build", "instructions", corpusSources([root])),
	);

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
	expect(failure.message).toContain("agents");
	expect(failure.message).not.toContain("private-project");
	expect(failure.message).not.toContain("secret.md");
	expect(failure.message).not.toContain("foreign contents");
}

async function testRefusesToInstallASnapshotEntryThatResolvesOutsideTheSnapshotDirectory(): Promise<void> {
	const { snapshotDirectory, worktree } =
		await escapingSnapshotFixture(testResources);

	const failure = await failureOf(
		installStageCorpusSnapshot(snapshotDirectory, worktree, noCitations),
	);

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
	expect(failure.message).toContain("agents/leak.md");
	expect(failure.message).not.toContain("SECRET BYTES");
}

describe("stage corpus confinement", () => {
	it(
		"refuses a layout root outside the corpus without naming its descendants",
		testRefusesALayoutRootOutsideTheCorpusWithoutNamingItsDescendants,
	);
	it(
		"refuses to install a snapshot entry that resolves outside the snapshot directory",
		testRefusesToInstallASnapshotEntryThatResolvesOutsideTheSnapshotDirectory,
	);
});
