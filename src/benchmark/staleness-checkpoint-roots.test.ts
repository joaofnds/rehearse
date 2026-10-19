import { afterEach, describe, expect, it } from "bun:test";
import { symlink } from "node:fs/promises";
import { join } from "node:path";

import { directorySource } from "./run-records-test-support";
import CheckpointCorpusFixtures from "./staleness-checkpoint-test-fixtures";
import { staleCheckpoints } from "./staleness-report";

const FIRST_STALENESS_RESULT_INDEX = 0;

const fixtures = new CheckpointCorpusFixtures();

afterEach(async () => {
	await fixtures.cleanup();
});

async function keepsACheckpointFreshWithLinkedFilesInTheCapturedLiveBackingTree(): Promise<void> {
	const fixture = await fixtures.writtenFixture();
	const root = await fixtures.corpusDirectory("build skill\n");
	const backingRoot = await fixtures.temporaryDirectory(
		"rehearse-stale-backing-",
	);
	await Bun.write(join(backingRoot, "reviewer.md"), "trusted reviewer\n");
	await symlink(backingRoot, join(root, "agents"));
	const source = { backingRoot, kind: "live", root } as const;
	await fixture.corpus.recordCorpusFrom(source);

	const stale = await staleCheckpoints(fixture.runsDirectory, source);

	expect(stale).toEqual([]);
}

async function reportsARefusedLayoutRootAsTheCheckpointSCause(): Promise<void> {
	const fixture = await fixtures.writtenFixture();
	const root = await fixtures.corpusDirectory("build skill\n");
	await fixture.corpus.recordCorpusFrom(directorySource(root));
	const outside = await fixtures.temporaryDirectory("rehearse-stale-foreign-");
	await Bun.write(join(outside, "private.md"), "foreign bytes\n");
	await symlink(outside, join(root, "agents"));

	const stale = await staleCheckpoints(
		fixture.runsDirectory,
		directorySource(root),
	);

	expect(stale.map(({ id, causes }) => ({ causes, id }))).toEqual([
		{
			causes: [
				"agents resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
			],
			id: `checkpoint:${fixture.replayableRun}/discuss`,
		},
		{
			causes: [
				"upstream stage discuss is stale",
				"agents resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
			],
			id: `checkpoint:${fixture.replayableRun}/build`,
		},
	]);
}

async function reportsALoopingLayoutDirectoryAsTheCheckpointSCauseRatherThanFailingTheReport(): Promise<void> {
	const fixture = await fixtures.writtenFixture();
	const root = await fixtures.corpusDirectory("build skill\n");
	await fixture.corpus.recordCorpusFrom(directorySource(root));
	await symlink(join(root, "agents"), join(root, "agents"));

	const stale = await staleCheckpoints(
		fixture.runsDirectory,
		directorySource(root),
	);

	expect(stale.at(FIRST_STALENESS_RESULT_INDEX)?.causes).toEqual([
		"agents is a link that never resolves to a file, so it names no bytes",
	]);
}

describe(staleCheckpoints.name, () => {
	it(
		"keeps a checkpoint fresh with linked files in the captured live backing tree",
		keepsACheckpointFreshWithLinkedFilesInTheCapturedLiveBackingTree,
	);
	it(
		"reports a refused layout root as the checkpoint's cause",
		reportsARefusedLayoutRootAsTheCheckpointSCause,
	);
	it(
		"reports a looping layout directory as the checkpoint's cause, rather than failing the report",
		reportsALoopingLayoutDirectoryAsTheCheckpointSCauseRatherThanFailingTheReport,
	);
});
