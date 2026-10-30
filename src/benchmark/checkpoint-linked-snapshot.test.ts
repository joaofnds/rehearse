import { describe, expect, it } from "bun:test";
import { readdir, rm, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import {
	captureStageCorpus,
	installStageCorpusSnapshot,
	snapshotStageCorpus,
} from "./checkpoint";
import {
	noCitations,
	writeFixtureFiles,
} from "./checkpoint-filesystem-test-fixture";
import {
	installedCorpus,
	linkedAgentCorpus,
	replaceLayoutWithLink,
} from "./checkpoint-linked-corpus-test-fixture";
import { SymlinkedEntryError } from "./file-presence";
import { TestResources } from "./test-support";

const resources = TestResources.forEachTest();

async function testLeavesTheDestinationUnchangedWhenALaterSelectedSkillEscapes(): Promise<void> {
	const source = await installedCorpus(resources);
	await writeFixtureFiles({
		files: [["agents/review.md", "healthy agent"]],
		root: source.root,
	});
	await replaceLayoutWithLink({
		files: [["SKILL.md", "foreign skill"]],
		layoutPath: "skills/build",
		outside: join(dirname(source.root), "outside"),
		source,
	});
	const snapshot = join(dirname(source.root), "snapshot");
	await writeFixtureFiles({
		files: [["CLAUDE.md", "previous instructions"]],
		root: snapshot,
	});

	const failure = await failureOf(
		snapshotStageCorpus(
			{ instructions: "instructions", skill: "build" },
			[source],
			snapshot,
		),
	);

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
	expect(failure.message).toContain("skills/build");
	expect(await readdir(snapshot)).toEqual(["CLAUDE.md"]);
	expect(await Bun.file(join(snapshot, "CLAUDE.md")).text()).toBe(
		"previous instructions",
	);
}

async function testInstallsCapturedLinkedInputsAfterTheOriginalTreesDisappear(): Promise<void> {
	const source = await linkedAgentCorpus(resources);
	const snapshot = join(dirname(source.root), "snapshot");
	const target = join(dirname(source.root), "target");

	const frozen = await snapshotStageCorpus(
		{ instructions: "instructions", skill: "build" },
		[source],
		snapshot,
	);
	await Promise.all([
		rm(source.root, { recursive: true }),
		rm(source.backingRoot, { recursive: true }),
	]);

	await installStageCorpusSnapshot(snapshot, target, noCitations);
	const installed = await captureStageCorpus("build", "instructions", [
		{ kind: "directory", root: join(target, ".claude") },
	]);

	expect(installed).toEqual(frozen);
	expect(
		await Bun.file(join(target, ".claude", "agents", "review.md")).text(),
	).toBe("captured agent");
	expect(
		await Bun.file(
			join(target, ".claude", "skills", "build", "alias.md"),
		).text(),
	).toBe("captured agent");
}

async function testCopiesNoForeignBytesWhenAPermittedLayoutContainsAnEscapingEntry(): Promise<void> {
	const source = await installedCorpus(resources);
	const outside = join(dirname(source.root), "outside");
	await writeFixtureFiles({
		files: [["secret.md", "private contents"]],
		root: outside,
	});
	await symlink(outside, join(source.backingRoot, "escape"));
	await symlink(source.backingRoot, join(source.root, "agents"));
	const snapshot = join(dirname(source.root), "snapshot");

	const failure = await failureOf(
		snapshotStageCorpus(
			{ instructions: "instructions", skill: "build" },
			[source],
			snapshot,
		),
	);

	expect(failure).toBeInstanceOf(SymlinkedEntryError);
	expect(failure.message).toContain("agents/escape");
	expect(
		await Bun.file(join(snapshot, "agents", "escape", "secret.md")).exists(),
	).toBe(false);
}

describe("linked corpus snapshot integrity", () => {
	it(
		"leaves the destination unchanged when a later selected skill escapes",
		testLeavesTheDestinationUnchangedWhenALaterSelectedSkillEscapes,
	);
	it(
		"installs captured linked inputs after the original trees disappear",
		testInstallsCapturedLinkedInputsAfterTheOriginalTreesDisappear,
	);
	it(
		"copies no foreign bytes when a permitted layout contains an escaping entry",
		testCopiesNoForeignBytesWhenAPermittedLayoutContainsAnEscapingEntry,
	);
});
