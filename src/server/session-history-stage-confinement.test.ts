import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import {
	SessionHistoryReaderError,
	readStageHistory,
} from "#server/session-history-reader";
import { writtenStage } from "#server/session-history-stage-test-fixture";
import {
	clearSessionHistoryRoots,
	writtenStoppedRun,
} from "#server/session-history-workspace-test-fixture";

afterEach(clearSessionHistoryRoots);

describe(readStageHistory.name, () => {
	describe("when a stage identity or evidence path is unsafe", () => {
		it(
			"refuses a stage whose checkpoint names another stage",
			verifyRefusesAStageWhoseCheckpointNamesAnotherStage,
		);

		it.each([
			["run segment", "../escape"],
			["stage segment", "../shape"],
		] as const)("refuses a traversing %s", async (name, segment) => {
			const fixture = await writtenStage();

			expect(
				readStageHistory(
					name === "run segment"
						? { ...fixture, run: segment }
						: { ...fixture, stage: segment },
				),
			).rejects.toMatchObject({ kind: "refused" });
		});

		it(
			"refuses a traversing stage segment on a run that also stopped",
			verifyRefusesATraversingStageSegmentOnARunThat,
		);

		it(
			"refuses a symlinked stage transcript",
			verifyRefusesASymlinkedStageTranscript,
		);

		it(
			"refuses a symlinked checkpoint directory",
			verifyRefusesASymlinkedCheckpointDirectory,
		);

		it(
			"reads the run manifest through the same verified handle the other records use",
			verifyReadsTheRunManifestThroughTheSameVerifiedHandle,
		);

		it(
			"refuses a stop record filed under another stage",
			verifyRefusesAStopRecordFiledUnderAnotherStage,
		);
	});
});

async function verifyRefusesAStageWhoseCheckpointNamesAnotherStage(): Promise<void> {
	const fixture = await writtenStage();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
	await mkdir(paths.checkpointDirectory("build"), { recursive: true });
	const buildCheckpointFile = join(
		paths.checkpointDirectory("build"),
		"checkpoint.json",
	);
	const planningCheckpointFile = join(
		paths.checkpointDirectory("shape"),
		"checkpoint.json",
	);
	await Bun.write(
		buildCheckpointFile,
		await Bun.file(planningCheckpointFile).text(),
	);

	expect(
		readStageHistory({ ...fixture, stage: "build" }),
	).rejects.toBeInstanceOf(SessionHistoryReaderError);
}

async function verifyRefusesATraversingStageSegmentOnARunThat(): Promise<void> {
	const fixture = await writtenStoppedRun();

	expect(
		readStageHistory({ ...fixture, stage: "../build" }),
	).rejects.toMatchObject({ kind: "refused" });
}

async function verifyRefusesASymlinkedStageTranscript(): Promise<void> {
	const fixture = await writtenStage();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
	const directory = paths.checkpointDirectory(fixture.stage);
	const outside = join(fixture.runsDirectory, "outside.jsonl");
	await Bun.write(outside, "secret");
	await rm(join(directory, "transcript.jsonl"));
	await symlink(outside, join(directory, "transcript.jsonl"));

	expect(readStageHistory(fixture)).rejects.toBeInstanceOf(
		SessionHistoryReaderError,
	);
}

async function verifyRefusesASymlinkedCheckpointDirectory(): Promise<void> {
	const fixture = await writtenStage();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
	const directory = paths.checkpointDirectory(fixture.stage);
	const outside = join(fixture.runsDirectory, "outside-stage");
	await mkdir(outside);
	await Bun.write(join(outside, "checkpoint.json"), "{}");
	await rm(directory, { recursive: true });
	await symlink(outside, directory);

	expect(readStageHistory(fixture)).rejects.toBeInstanceOf(
		SessionHistoryReaderError,
	);
}

async function verifyReadsTheRunManifestThroughTheSameVerifiedHandle(): Promise<void> {
	const fixture = await writtenStage();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
	const outside = join(fixture.runsDirectory, "outside-manifest.json");
	await Bun.write(outside, await Bun.file(paths.manifestFile).text());
	await rm(paths.manifestFile);
	await symlink(outside, paths.manifestFile);

	expect(readStageHistory(fixture)).rejects.toBeInstanceOf(
		SessionHistoryReaderError,
	);
}

async function verifyRefusesAStopRecordFiledUnderAnotherStage(): Promise<void> {
	const fixture = await writtenStoppedRun();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
	await Bun.write(
		paths.stageFile("review"),
		await Bun.file(paths.stageFile("build")).text(),
	);

	expect(
		readStageHistory({ ...fixture, stage: "review" }),
	).rejects.toMatchObject({ kind: "refused" });
}
