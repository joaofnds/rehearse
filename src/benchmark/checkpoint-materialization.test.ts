import { describe, expect, it } from "bun:test";
import { chmod, mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import {
	lineageKey,
	materializeCheckpoint,
	recordCheckpoint,
} from "./checkpoint";
import {
	CheckpointInputsBuilder,
	checkpointFixture,
	customBoardCheckpointFixture,
} from "./checkpoint-workflow-test-fixture";
import { TestResources } from "./test-support";

const DIGEST_QUARTET_REPETITIONS = 16;

const NO_ACCESS_MODE = 0o000;

const EXECUTABLE_DIRECTORY_MODE = 0o755;

const testResources = TestResources.forEachTest();

async function testMaterializesARecordedCheckpointByteForByte(): Promise<void> {
	const { targetDir, checkpointDir, destination } =
		await checkpointFixture(testResources);

	const record = await recordCheckpoint(
		targetDir,
		checkpointDir,
		new CheckpointInputsBuilder().build(),
	);
	await mkdir(destination, { recursive: true });

	const materialized = await materializeCheckpoint(checkpointDir, destination);

	expect(materialized).toEqual(record);
	await Array.fromAsync(record.workflowState, async ({ path }) => {
		expect(await Bun.file(join(destination, path)).bytes()).toEqual(
			await Bun.file(join(targetDir, path)).bytes(),
		);
	});
	expect(await Bun.file(join(destination, "ignored.ts")).exists()).toBe(false);
	const draftsStats = await stat(join(destination, "backlog", "drafts"));
	expect(draftsStats.isDirectory()).toBe(true);
}

async function testMaterializesARootConfigurationAndItsCustomBoard(): Promise<void> {
	const { targetDir, checkpointDir, destination, config } =
		await customBoardCheckpointFixture(testResources);

	const record = await recordCheckpoint(
		targetDir,
		checkpointDir,
		new CheckpointInputsBuilder().build(),
	);
	await mkdir(destination, { recursive: true });

	await materializeCheckpoint(checkpointDir, destination);

	expect(record.workflowState.map(({ path }) => path).toSorted()).toEqual([
		"backlog.config.yml",
		"workflow-board/tasks/work-1.md",
	]);
	expect(await Bun.file(join(destination, "backlog.config.yml")).text()).toBe(
		config,
	);
	expect(
		await Bun.file(
			join(destination, "workflow-board", "tasks", "work-1.md"),
		).text(),
	).toBe("the task\n");
}

async function testFailsOnAnUnreadableWorkflowPathInsteadOfRecordingItAbsent(): Promise<void> {
	const { targetDir, checkpointDir } = await checkpointFixture(testResources);
	const checkpointInputs = new CheckpointInputsBuilder().build();
	await chmod(targetDir, NO_ACCESS_MODE);

	try {
		expect(
			recordCheckpoint(targetDir, checkpointDir, checkpointInputs),
		).rejects.toThrow(/permission denied|EACCES/iu);
	} finally {
		await chmod(targetDir, EXECUTABLE_DIRECTORY_MODE);
	}
}

async function testOrdersRecordedFilesByCodepointNotLocale(): Promise<void> {
	const { targetDir, checkpointDir } = await checkpointFixture(testResources);

	const record = await recordCheckpoint(
		targetDir,
		checkpointDir,
		new CheckpointInputsBuilder({
			artifacts: [
				{ path: "a.md", sha256: "aa11".repeat(DIGEST_QUARTET_REPETITIONS) },
				{ path: "B.md", sha256: "bb22".repeat(DIGEST_QUARTET_REPETITIONS) },
			],
		}).build(),
	);

	expect(record.artifacts.map(({ path }) => path)).toEqual(["B.md", "a.md"]);
}

async function testSnapshotsOnlyTheWorkflowPathsThatExist(): Promise<void> {
	const { targetDir, checkpointDir } = await checkpointFixture(testResources);
	await rm(join(targetDir, ".boris"), { force: true, recursive: true });

	const record = await recordCheckpoint(
		targetDir,
		checkpointDir,
		new CheckpointInputsBuilder().build(),
	);

	expect(
		record.workflowState.every(({ path }) => path.startsWith("backlog/")),
	).toBe(true);
}

async function testRecordsWorkflowIdentity(): Promise<void> {
	const checkpointInputs = new CheckpointInputsBuilder().build();
	const { targetDir, checkpointDir } = await checkpointFixture(testResources);

	const record = await recordCheckpoint(
		targetDir,
		checkpointDir,
		checkpointInputs,
	);

	expect(record.lineage).toBe(
		lineageKey({
			corpusFiles: checkpointInputs.corpusFiles,
			effort: "high",
			model: "sonnet",
			upstream: "root-key",
		}),
	);
	expect(record.workflowState.map(({ path }) => path).toSorted()).toEqual([
		".boris/CONTEXT.md",
		"backlog/config.yml",
		"backlog/docs/DOC-1 - spec.md",
	]);
}

describe("checkpoint workflow snapshots", () => {
	it(
		"records the requested identity and workflow manifest",
		testRecordsWorkflowIdentity,
	);
	it(
		"materializes a recorded checkpoint byte-for-byte",
		testMaterializesARecordedCheckpointByteForByte,
	);
	it(
		"materializes a root configuration and its custom board",
		testMaterializesARootConfigurationAndItsCustomBoard,
	);
	it(
		"fails on an unreadable workflow path instead of recording it absent",
		testFailsOnAnUnreadableWorkflowPathInsteadOfRecordingItAbsent,
	);
	it(
		"orders recorded files by codepoint, not locale",
		testOrdersRecordedFilesByCodepointNotLocale,
	);
	it(
		"snapshots only the workflow paths that exist",
		testSnapshotsOnlyTheWorkflowPathsThatExist,
	);
});
