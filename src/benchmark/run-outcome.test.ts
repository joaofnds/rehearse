import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { benchmarkRunPaths } from "./run-layout";
import { stoppedStage } from "./run-outcome";
import { RecordedRunsFixture } from "./run-records-test-support";

const RESOURCE_DRAIN_START_INDEX = 0;

const roots: string[] = [];

async function fixture(): Promise<RecordedRunsFixture> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-run-outcome-"));
	roots.push(root);

	return new RecordedRunsFixture(root);
}

const stoppedStageNamesTheStageWhoseFileHoldsAStopRecordAmongSeveralStageFiles =
	async (): Promise<void> => {
		const runs = await fixture();
		await runs.stopped.writeStoppedRun();

		const found = await stoppedStage(runs.runsDirectory, runs.stoppedRun);

		expect(found).toEqual({
			error: "build stage graded F; minimum grade is B",
			stage: "build",
		});
	};

const stoppedStageNamesAStoppedStageWhoseRecordCarriesFieldsItCannotRead =
	async (): Promise<void> => {
		const runs = await fixture();
		await runs.stopped.writeStoppedRun();
		await Bun.write(
			benchmarkRunPaths(runs.runsDirectory, runs.stoppedRun).stageFile("build"),
			JSON.stringify({
				corpusFiles: [{ path: "CLAUDE.md" }],
				error: "build stage graded F; minimum grade is B",
				stage: "build",
				status: "STAGE_JUDGE_FAILED",
			}),
		);

		const found = await stoppedStage(runs.runsDirectory, runs.stoppedRun);

		expect(found).toEqual({
			error: "build stage graded F; minimum grade is B",
			stage: "build",
		});
	};

const stoppedStageNamesAStoppedStageDespiteAnOverflowingNumberInUnusedMetadata =
	async (): Promise<void> => {
		const runs = await fixture();
		await runs.stopped.writeStoppedRun();
		await Bun.write(
			benchmarkRunPaths(runs.runsDirectory, runs.stoppedRun).stageFile("build"),
			'{"status":"STAGE_JUDGE_FAILED","stage":"build","error":"judge failed","extra":1e400}',
		);

		const found = await stoppedStage(runs.runsDirectory, runs.stoppedRun);

		expect(found).toEqual({
			error: "judge failed",
			stage: "build",
		});
	};

const stoppedStageFindsNothingForARunWhoseStagesAllJudgedClean =
	async (): Promise<void> => {
		const runs = await fixture();
		await runs.write();

		expect(
			await stoppedStage(runs.runsDirectory, runs.replayableRun),
		).toBeUndefined();
	};

const stoppedStageFindsNothingForARunWithNoStageFilesAtAll =
	async (): Promise<void> => {
		const runs = await fixture();
		await runs.events.writeNoRecordRun();

		expect(
			await stoppedStage(runs.runsDirectory, runs.noRecordRun),
		).toBeUndefined();
	};

describe(stoppedStage.name, () => {
	afterEach(async () => {
		await Promise.all(
			roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
				await rm(root, { force: true, recursive: true });
			}),
		);
	});

	it(
		"names the stage whose file holds a stop record among several stage files",
		stoppedStageNamesTheStageWhoseFileHoldsAStopRecordAmongSeveralStageFiles,
	);

	it(
		"names a stopped stage whose record carries fields it cannot read",
		stoppedStageNamesAStoppedStageWhoseRecordCarriesFieldsItCannotRead,
	);

	it(
		"names a stopped stage despite an overflowing number in unused metadata",
		stoppedStageNamesAStoppedStageDespiteAnOverflowingNumberInUnusedMetadata,
	);

	it(
		"finds nothing for a run whose stages all judged clean",
		stoppedStageFindsNothingForARunWhoseStagesAllJudgedClean,
	);

	it(
		"finds nothing for a run with no stage files at all",
		stoppedStageFindsNothingForARunWithNoStageFilesAtAll,
	);
});
