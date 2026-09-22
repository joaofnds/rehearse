import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RecordedRunsFixture } from "./run-records-test-support";
import { stoppedStage } from "./run-outcome";
import { benchmarkRunPaths } from "./run-layout";

describe(stoppedStage.name, () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
		);
	});

	async function fixture(): Promise<RecordedRunsFixture> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-run-outcome-"));
		roots.push(root);

		return new RecordedRunsFixture(root);
	}

	it("names the stage whose file holds a stop record among several stage files", async () => {
		const runs = await fixture();
		await runs.writeStoppedRun();

		const found = await stoppedStage(runs.runsDirectory, runs.stoppedRun);

		expect(found).toEqual({
			stage: "build",
			error: "build stage graded F; minimum grade is B",
		});
	});

	it("names a stopped stage whose record carries fields it cannot read", async () => {
		const runs = await fixture();
		await runs.writeStoppedRun();
		await Bun.write(
			benchmarkRunPaths(runs.runsDirectory, runs.stoppedRun).stageFile("build"),
			JSON.stringify({
				status: "STAGE_JUDGE_FAILED",
				stage: "build",
				error: "build stage graded F; minimum grade is B",
				corpusFiles: [{ path: "CLAUDE.md" }],
			}),
		);

		const found = await stoppedStage(runs.runsDirectory, runs.stoppedRun);

		expect(found).toEqual({
			stage: "build",
			error: "build stage graded F; minimum grade is B",
		});
	});

	it("finds nothing for a run whose stages all judged clean", async () => {
		const runs = await fixture();
		await runs.write();

		expect(
			await stoppedStage(runs.runsDirectory, runs.replayableRun),
		).toBeUndefined();
	});

	it("finds nothing for a run with no stage files at all", async () => {
		const runs = await fixture();
		await runs.writeNoRecordRun();

		expect(
			await stoppedStage(runs.runsDirectory, runs.noRecordRun),
		).toBeUndefined();
	});
});
