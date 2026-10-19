import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { runPathsExpected } from "./record-layout-path-fixtures";
import RecordLayoutFixtures from "./record-layout-test-fixtures";
import type { StageAttemptId } from "./replay-layout";
import {
	benchmarkRunPaths,
	benchmarkRunsDirectory,
	checkpointRecordFile,
	checkpointStageNames,
	comparisonDigests,
	confirmationGroupIds,
	recordedRunNames,
	replayAttemptIds,
	runEventsDatabaseFile,
	runNameFromCheckpointsEntry,
	runNameFromTimestamp,
	runStageFiles,
	sessionAttemptIds,
} from "./run-layout";
import type { SessionAttemptId } from "./session-attempt-layout";

const fixtures = RecordLayoutFixtures.forEachTest();

function namesOneDatabaseFileSharedAcrossEveryRunUnderTheRunsDirectory(): void {
	const runsDirectory = benchmarkRunsDirectory("/control");

	expect(runEventsDatabaseFile(runsDirectory)).toBe(
		join("/control", ".benchmark-runs", "run-events.sqlite"),
	);
}

function preservesEveryExistingRunArtifactPath(): void {
	const runsDirectory = benchmarkRunsDirectory("/control");
	const name = runNameFromTimestamp("2026-08-31T01:45:19.323Z");
	const paths = benchmarkRunPaths(runsDirectory, name);

	expect(paths).toMatchObject(runPathsExpected);
	expect(paths.stageFile("shape")).toBe(
		join("/control", ".benchmark-runs", "2026-08-31T01-45-19.323Z.shape.json"),
	);
	expect(paths.checkpointDirectory("initial")).toBe(
		join(
			"/control",
			".benchmark-runs",
			"2026-08-31T01-45-19.323Z.checkpoints",
			"initial",
		),
	);
	expect(paths.replayRecordFile("lineage-1", "2026-08-31T04:22:25.607Z")).toBe(
		join(
			"/control",
			".benchmark-runs",
			"replays",
			"lineage-1",
			"2026-08-31T04-22-25.607Z.json",
		),
	);
	expect(runNameFromCheckpointsEntry("run-1.checkpoints")).toBe("run-1");
	expect(runNameFromCheckpointsEntry("run-1.json")).toBeUndefined();
}

function namesTheRecordFileInsideACheckpointDirectory(): void {
	expect(checkpointRecordFile("/checkpoints/build")).toBe(
		join("/checkpoints", "build", "checkpoint.json"),
	);
}

async function namesEveryRunThatRecordedACheckpointsDirectory(): Promise<void> {
	const root = await fixtures.root();
	await mkdir(join(root, "run-b.checkpoints", "build"), { recursive: true });
	await mkdir(join(root, "run-a.checkpoints"), { recursive: true });
	await Bun.write(join(root, "run-a.json"), "{}\n");

	expect(await recordedRunNames(root)).toEqual(["run-a", "run-b"]);
}

async function namesEveryPerStageFileARunWroteArtifactAndReviewExcluded(): Promise<void> {
	const root = await fixtures.root();
	await Bun.write(join(root, "run-a.shape.json"), "{}\n");
	await Bun.write(join(root, "run-a.build.json"), "{}\n");
	await Bun.write(join(root, "run-a.json"), "{}\n");
	await Bun.write(join(root, "run-a.review.json"), "{}\n");
	await Bun.write(join(root, "run-ab.shape.json"), "{}\n");

	expect(await runStageFiles(root, "run-a")).toEqual([
		join(root, "run-a.build.json"),
		join(root, "run-a.shape.json"),
	]);
}

async function namesEveryCheckpointStageARunRecordedSorted(): Promise<void> {
	const root = await fixtures.root();
	await mkdir(join(root, "run-a.checkpoints", "build"), { recursive: true });
	await mkdir(join(root, "run-a.checkpoints", "initial"), {
		recursive: true,
	});

	expect(await checkpointStageNames(root, "run-a")).toEqual([
		"build",
		"initial",
	]);
}

async function readsARunWithNoCheckpointsDirectoryAsNoStagesRecorded(): Promise<void> {
	const root = await fixtures.root();

	expect(await checkpointStageNames(root, "absent-run")).toEqual([]);
}

async function readsAnAbsentRunsDirectoryAsNothingRecorded(
	enumerate: (
		runsDirectory: string,
	) => Promise<readonly (string | StageAttemptId | SessionAttemptId)[]>,
): Promise<void> {
	const entries = await enumerate(join(await fixtures.root(), "absent"));
	expect(entries).toEqual([]);
}

describe(runEventsDatabaseFile.name, () => {
	it(
		"names one database file shared across every run under the runs directory",
		namesOneDatabaseFileSharedAcrossEveryRunUnderTheRunsDirectory,
	);
});
describe(benchmarkRunPaths.name, () => {
	it(
		"preserves every existing run artifact path",
		preservesEveryExistingRunArtifactPath,
	);
});
describe(checkpointRecordFile.name, () => {
	it(
		"names the record file inside a checkpoint directory",
		namesTheRecordFileInsideACheckpointDirectory,
	);
});
describe("recorded record enumeration", () => {
	it(
		"names every run that recorded a checkpoints directory",
		namesEveryRunThatRecordedACheckpointsDirectory,
	);
	it(
		"names every per-stage file a run wrote, artifact and review excluded",
		namesEveryPerStageFileARunWroteArtifactAndReviewExcluded,
	);
	it(
		"names every checkpoint stage a run recorded, sorted",
		namesEveryCheckpointStageARunRecordedSorted,
	);
	it(
		"reads a run with no checkpoints directory as no stages recorded",
		readsARunWithNoCheckpointsDirectoryAsNoStagesRecorded,
	);
	it.each([
		recordedRunNames,
		confirmationGroupIds,
		comparisonDigests,
		sessionAttemptIds,
		replayAttemptIds,
	])(
		"reads an absent runs directory as nothing recorded",
		readsAnAbsentRunsDirectoryAsNothingRecorded,
	);
});
