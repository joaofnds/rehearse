import { afterEach, describe, expect, it } from "bun:test";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import {
	AWAITING_JUDGE_EXCHANGE_TEXT,
	AWAITING_JUDGE_SESSION_ID,
} from "#benchmark/run-records-test-support";
import {
	readStageCorpusReconciliation,
	readStageHistory,
	readStageHistoryDetail,
} from "#server/session-history-reader";
import {
	clearSessionHistoryRoots,
	writtenAwaitingJudgeRun,
} from "#server/session-history-workspace-test-fixture";

afterEach(clearSessionHistoryRoots);

describe(readStageHistory.name, () => {
	describe("when judging never completed", () => {
		it(
			"names a stage whose judging never completed rather than reporting it absent",
			verifyNamesAStageWhoseJudgingNeverCompletedRatherThan,
		);

		it(
			"keeps an awaiting-judge stage's parsed exchanges out of every event ledger",
			verifyKeepsAnAwaitingJudgeStageSParsedExchangesOut,
		);

		it(
			"keeps an awaiting-judge record's session content out of everything it serves",
			verifyKeepsAnAwaitingJudgeRecordSSessionContentOut,
		);

		it(
			"does not describe an awaiting-judge stage as stopped",
			verifyDoesNotDescribeAnAwaitingJudgeStageAsStopped,
		);

		it(
			"reports the judged stage beside it as absent rather than awaiting judgment",
			verifyReportsTheJudgedStageBesideItAsAbsentRather,
		);

		it(
			"refuses an awaiting-judge record filed under another stage",
			verifyRefusesAnAwaitingJudgeRecordFiledUnderAnotherStage,
		);

		it(
			"reports a stage with no record at all as absent",
			verifyReportsAStageWithNoRecordAtAllAs,
		);
	});
});

describe(readStageHistoryDetail.name, () => {
	describe("when judging never completed", () => {
		it(
			"serves no event detail for an awaiting-judge stage, whose record parsed a transcript",
			verifyServesNoEventDetailForAnAwaitingJudgeStage,
		);
	});
});

async function verifyNamesAStageWhoseJudgingNeverCompletedRatherThan(): Promise<void> {
	const fixture = await writtenAwaitingJudgeRun();

	const report = await readStageHistory(fixture);

	expect(report.attempt).toEqual({
		caseId: "audit-log",
		corpusFiles: [],
		kind: "awaiting-judge-stage",
		model: "sonnet",
		run: fixture.run,
		stage: "build",
	});
	expect(report.evidence).toEqual({
		reasons: [
			"this stage ran and its judging never completed, so no transcript was recorded",
		],
		state: "unavailable",
	});
}

async function verifyKeepsAnAwaitingJudgeStageSParsedExchangesOut(): Promise<void> {
	const fixture = await writtenAwaitingJudgeRun();

	const report = await readStageHistory(fixture);

	expect(report.startingContext).toEqual([]);
	expect(report.attemptEvents).toEqual([]);
	expect(report.boundaryUnknown).toEqual([]);
	expect(report.sources).toEqual([]);
	expect(report.startingSources).toEqual([]);
}

async function verifyServesNoEventDetailForAnAwaitingJudgeStage(): Promise<void> {
	const fixture = await writtenAwaitingJudgeRun();

	const detail = await readStageHistoryDetail(fixture, "1:1");

	expect(detail).toBeUndefined();
}

async function verifyKeepsAnAwaitingJudgeRecordSSessionContentOut(): Promise<void> {
	const fixture = await writtenAwaitingJudgeRun();

	const served = JSON.stringify([
		await readStageHistory(fixture),
		await readStageCorpusReconciliation(fixture),
		await readStageHistoryDetail(fixture, "1:1"),
	]);

	expect(served).not.toContain(AWAITING_JUDGE_SESSION_ID);
	expect(served).not.toContain(AWAITING_JUDGE_EXCHANGE_TEXT);
}

async function verifyDoesNotDescribeAnAwaitingJudgeStageAsStopped(): Promise<void> {
	const fixture = await writtenAwaitingJudgeRun();

	const report = await readStageHistory(fixture);

	expect(JSON.stringify(report)).not.toContain("stopped");
}

async function verifyReportsTheJudgedStageBesideItAsAbsentRather(): Promise<void> {
	const fixture = await writtenAwaitingJudgeRun();

	expect(
		readStageHistory({ ...fixture, stage: "discuss" }),
	).rejects.toMatchObject({ kind: "not-found" });
}

async function verifyRefusesAnAwaitingJudgeRecordFiledUnderAnotherStage(): Promise<void> {
	const fixture = await writtenAwaitingJudgeRun();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
	await Bun.write(
		paths.stageFile("review"),
		await Bun.file(paths.stageFile("build")).text(),
	);

	expect(
		readStageHistory({ ...fixture, stage: "review" }),
	).rejects.toMatchObject({ kind: "refused" });
}

async function verifyReportsAStageWithNoRecordAtAllAs(): Promise<void> {
	const fixture = await writtenAwaitingJudgeRun();

	expect(
		readStageHistory({ ...fixture, stage: "nonexistent" }),
	).rejects.toMatchObject({ kind: "not-found" });
}
