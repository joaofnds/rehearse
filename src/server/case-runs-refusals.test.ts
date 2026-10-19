import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { confirmationGroupPaths } from "#benchmark/run-layout";
import { CASE_ID, nothingRunning } from "#benchmark/run-records-test-support";
import {
	clearCaseRunRoot,
	fixture,
	prepareCaseRunRoot,
	root,
} from "#server/case-runs-test-fixture";

import readCaseRuns from "./case-runs";

beforeEach(prepareCaseRunRoot);

afterEach(clearCaseRunRoot);

const OLDER_RUN = "2026-09-02T00-00-00.000Z";

const NEWER_RUN = "2026-09-03T00-00-00.000Z";

const SESSION_CASE = "smoke";

async function verifyReadCaseRunsReportsARepRecordItCannotReadAndStillCountsTheRep(): Promise<void> {
	const expectedRunCount = 2;

	const [rep] =
		await fixture.confirmations.records.writeSessionGroup("group-s");
	await Bun.write(
		confirmationGroupPaths(root, "group-s").rep(rep).recordFile,
		"{ not json",
	);

	const { cases, unreadable } = await readCaseRuns(root, nothingRunning);

	expect(cases.get(SESSION_CASE)?.runs).toHaveLength(expectedRunCount);
	expect(unreadable.map(({ id }) => id)).toEqual([`group-s/${rep}`]);
}

async function verifyReadCaseRunsLeavesStageModeGroupsAndStageReplaysOutOfEveryCase(): Promise<void> {
	await fixture.confirmations.records.writeStageGroupWithReps("group-st");
	await fixture.sessions.writeReplayOf({
		run: OLDER_RUN,
		timestamp: NEWER_RUN,
	});

	const { cases } = await readCaseRuns(root, nothingRunning);

	expect([...cases.keys()]).toEqual([]);
}

async function verifyReadCaseRunsReportsARecordItCannotReadAndReadsTheRest(): Promise<void> {
	const expectedRunCount = 1;

	await fixture.pipeline.writeFinishedRunEvidence(OLDER_RUN);
	await fixture.confirmations.records.writeUnreadableGroup("group-x");

	const { cases, unreadable } = await readCaseRuns(root, nothingRunning);

	expect(cases.get(CASE_ID)?.runs).toHaveLength(expectedRunCount);
	expect(unreadable.map(({ id }) => id)).toEqual(["group-x"]);
}

describe(readCaseRuns.name, () => {
	it(
		"reports a rep record it cannot read and still counts the rep",
		verifyReadCaseRunsReportsARepRecordItCannotReadAndStillCountsTheRep,
	);
	it(
		"leaves stage-mode groups and stage replays out of every case",
		verifyReadCaseRunsLeavesStageModeGroupsAndStageReplaysOutOfEveryCase,
	);
	it(
		"reports a record it cannot read and reads the rest",
		verifyReadCaseRunsReportsARecordItCannotReadAndReadsTheRest,
	);
});
