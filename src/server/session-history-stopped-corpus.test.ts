import { afterEach, describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import { stageCorpusReconciliation } from "#benchmark/session-history";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";
import { readStageHistory } from "#server/session-history-reader";
import {
	clearSessionHistoryRoots,
	writtenStoppedRun,
} from "#server/session-history-workspace-test-fixture";

afterEach(clearSessionHistoryRoots);

describe(readStageHistory.name, () => {
	describe("when a stopped stage retains terminal metadata", () => {
		it(
			"reconciles a stopped stage's declared corpus as unobserved rather than absent",
			verifyReconcilesAStoppedStageSDeclaredCorpusAsUnobserved,
		);

		it(
			"names the stop without asserting a grade, for a stage a signal stopped",
			verifyNamesTheStopWithoutAssertingAGradeForA,
		);

		it(
			"reports the model the stopped stage recorded rather than the run's",
			verifyReportsTheModelTheStoppedStageRecordedRatherThan,
		);
	});

	describe("when declared corpus metadata cannot be read", () => {
		it(
			"reports the stop when the record's declared corpus is unreadable",
			verifyReportsTheStopWhenTheRecordSDeclaredCorpus,
		);
	});

	describe("when the saved error includes a host path", () => {
		it(
			"keeps an absolute host path out of a stopped stage's reason",
			verifyKeepsAnAbsoluteHostPathOutOfAStopped,
		);
	});
});

async function verifyReconcilesAStoppedStageSDeclaredCorpusAsUnobserved(): Promise<void> {
	const fixture = await writtenStoppedRun();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
	await Bun.write(
		paths.stageFile("build"),
		JSON.stringify({
			corpusFiles: [
				{ path: "CLAUDE.md", sha256: "a".repeat(SHA256_HEX_DIGITS) },
			],
			error: "build stage graded C; minimum grade is B",
			stage: "build",
			status: "STAGE_JUDGE_FAILED",
		}),
	);

	const report = await readStageHistory(fixture);

	expect(stageCorpusReconciliation(report)).toEqual([
		{ path: "CLAUDE.md", state: "no-observation-recorded" },
	]);
}

async function verifyNamesTheStopWithoutAssertingAGradeForA(): Promise<void> {
	const fixture = await writtenStoppedRun();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
	await Bun.write(
		paths.stageFile("build"),
		JSON.stringify({
			error: "run interrupted by SIGINT",
			stage: "build",
			status: "STAGE_JUDGE_FAILED",
		}),
	);

	const report = await readStageHistory(fixture);

	expect(report.evidence).toEqual({
		reasons: ["this stage stopped before recording a transcript"],
		state: "unavailable",
	});
	expect(report.attempt).toMatchObject({
		error: "run interrupted by SIGINT",
	});
}

async function verifyReportsTheStopWhenTheRecordSDeclaredCorpus(): Promise<void> {
	const fixture = await writtenStoppedRun();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
	await Bun.write(
		paths.stageFile("build"),
		JSON.stringify({
			corpusFiles: [{ path: "CLAUDE.md" }],
			error: "build stage graded C; minimum grade is B",
			stage: "build",
			status: "STAGE_JUDGE_FAILED",
		}),
	);

	const report = await readStageHistory(fixture);

	expect(report.attempt).toMatchObject({
		corpusFiles: [],
		error: "build stage graded C; minimum grade is B",
	});
}

async function verifyReportsTheModelTheStoppedStageRecordedRatherThan(): Promise<void> {
	const fixture = await writtenStoppedRun();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
	await Bun.write(
		paths.stageFile("build"),
		JSON.stringify({
			error: "build stage graded C; minimum grade is B",
			model: "opus",
			stage: "build",
			status: "STAGE_JUDGE_FAILED",
		}),
	);

	const report = await readStageHistory(fixture);

	expect(report.attempt).toMatchObject({ model: "opus" });
}

async function verifyKeepsAnAbsoluteHostPathOutOfAStopped(): Promise<void> {
	const fixture = await writtenStoppedRun();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
	const stageFile = paths.stageFile("build");
	const rubricFile = join(homedir(), "secrets", "rubric.json");
	await Bun.write(
		stageFile,
		JSON.stringify({
			error: `build stage rubric missing at ${rubricFile}`,
			stage: "build",
			status: "STAGE_JUDGE_FAILED",
		}),
	);

	const report = await readStageHistory(fixture);

	expect(JSON.stringify(report)).not.toContain(homedir());
}
