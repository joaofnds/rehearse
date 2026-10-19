import { describe, expect, it } from "bun:test";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

import { materializeCheckpoint, recordCheckpoint } from "./checkpoint";
import {
	CheckpointInputsBuilder,
	checkpointFixture,
} from "./checkpoint-workflow-test-fixture";
import { TestResources } from "./test-support";

const DIGEST_QUARTET_REPETITIONS = 16;

const testResources = TestResources.forEachTest();

async function testRefusesToMaterializeATamperedSnapshotCopyingNothing(): Promise<void> {
	const { targetDir, checkpointDir, destination } =
		await checkpointFixture(testResources);

	await recordCheckpoint(
		targetDir,
		checkpointDir,
		new CheckpointInputsBuilder().build(),
	);
	await Bun.write(
		join(checkpointDir, "workflow-state", "backlog", "config.yml"),
		"tampered\n",
	);
	await mkdir(destination, { recursive: true });

	expect(materializeCheckpoint(checkpointDir, destination)).rejects.toThrow(
		/backlog\/config.yml/u,
	);
	expect(await readdir(destination)).toEqual([]);
}

async function testRefusesASnapshotCarryingAFileTheRecordDoesNotList(): Promise<void> {
	const { targetDir, checkpointDir, destination } =
		await checkpointFixture(testResources);

	await recordCheckpoint(
		targetDir,
		checkpointDir,
		new CheckpointInputsBuilder().build(),
	);
	await Bun.write(
		join(checkpointDir, "workflow-state", "backlog", "planted.md"),
		"planted\n",
	);
	await mkdir(destination, { recursive: true });

	expect(materializeCheckpoint(checkpointDir, destination)).rejects.toThrow(
		/backlog\/planted.md/u,
	);
	expect(await readdir(destination)).toEqual([]);
}

async function testRefusesARecordWhosePathsEscapeTheDestination(): Promise<void> {
	const { targetDir, checkpointDir, destination } =
		await checkpointFixture(testResources);

	const record = await recordCheckpoint(
		targetDir,
		checkpointDir,
		new CheckpointInputsBuilder().build(),
	);
	await Bun.write(
		join(checkpointDir, "checkpoint.json"),
		JSON.stringify({
			...record,
			workflowState: [
				{
					path: "../../../etc/hosts",
					sha256: "aa11".repeat(DIGEST_QUARTET_REPETITIONS),
				},
			],
		}),
	);
	await mkdir(destination, { recursive: true });

	expect(materializeCheckpoint(checkpointDir, destination)).rejects.toThrow();
	expect(await readdir(destination)).toEqual([]);
}

describe("checkpoint snapshot integrity", () => {
	it(
		"refuses to materialize a tampered snapshot, copying nothing",
		testRefusesToMaterializeATamperedSnapshotCopyingNothing,
	);
	it(
		"refuses a snapshot carrying a file the record does not list",
		testRefusesASnapshotCarryingAFileTheRecordDoesNotList,
	);
	it(
		"refuses a record whose paths escape the destination",
		testRefusesARecordWhosePathsEscapeTheDestination,
	);
});
