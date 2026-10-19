import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";

import { confirmationGroupPaths } from "#benchmark/run-layout";
import { nothingRunning } from "#benchmark/run-records-test-support";
import { parseSessionAttemptRecord } from "#benchmark/session-record";
import { sessionGroupWithAttemptChanges } from "#server/case-runs-record-test-fixture";
import {
	clearCaseRunRoot,
	fixture,
	prepareCaseRunRoot,
	root,
} from "#server/case-runs-test-fixture";

import readCaseRuns from "./case-runs";

beforeEach(prepareCaseRunRoot);

afterEach(clearCaseRunRoot);

const INITIAL_SESSION_REP_INDEX = 0;

const SINGLE_SESSION_REP_COUNT = 1;

const FIRST_CASE_COHORT_MEMBER_INDEX = 0;

const SESSION_CASE = "smoke";

async function verifyReadCaseRunsPreservesASessionSRecordedSuccessWhileExposingItsFailedSavedStateLayer(): Promise<void> {
	const file = await fixture.sessions.writeAttemptAt(
		"0f6b6f2a-0000-4000-8000-00000000000b",
		{
			caseId: SESSION_CASE,
			corpusRoot: join(import.meta.dir, "..", ".."),
			layoutPaths: [],
		},
	);
	const record = parseSessionAttemptRecord(await Bun.file(file).text());
	await Bun.write(
		file,
		JSON.stringify({
			...record,
			schemaVersion: 3,
			stateResults: Array.from({ length: 19 }, (_unused, index) => ({
				detail: "saved state evidence",
				name: `state-${String(index)}`,
				status: index === INITIAL_SESSION_REP_INDEX ? "PASS" : "FAIL",
			})),
		}),
	);
	const { cases } = await readCaseRuns(root, nothingRunning);
	expect(
		cases.get(SESSION_CASE)?.members[FIRST_CASE_COHORT_MEMBER_INDEX]?.run,
	).toMatchObject({
		passed: true,
		recordedOutcome: "SUCCESSFUL",
		replyChecks: { passed: 1, total: 1 },
		savedState: { failed: 18, passed: 1, state: "assessed", total: 19 },
	});
}

async function verifyReadCaseRunsReadsASessionCohortRepetitionSSavedStateLayerFromItsSavedAttempt(): Promise<void> {
	const [repId] = await fixture.confirmations.records.writeSessionGroup(
		"group-s",
		SINGLE_SESSION_REP_COUNT,
	);
	const file = confirmationGroupPaths(root, "group-s").rep(repId).attemptFile;
	const record = parseSessionAttemptRecord(await Bun.file(file).text());
	await Bun.write(
		file,
		JSON.stringify({
			...record,
			schemaVersion: 3,
			stateResults: [
				{ detail: "history was changed", name: "history", status: "FAIL" },
			],
		}),
	);
	const { cases } = await readCaseRuns(root, nothingRunning);
	expect(
		cases.get(SESSION_CASE)?.members[FIRST_CASE_COHORT_MEMBER_INDEX]?.run,
	).toMatchObject({
		recordedOutcome: "SUCCESSFUL",
		replyChecks: { passed: 1, total: 1 },
		savedState: { failed: 1, passed: 0, state: "assessed", total: 1 },
	});
}

async function verifyReadCaseRunsKeepsAMalformedSessionAttemptSCauseWhileRedactingItsAbsolutePath(): Promise<void> {
	await sessionGroupWithAttemptChanges("malformed-state", {
		"/Users/private/saved-state-secret": true,
	});
	const { cases } = await readCaseRuns(root, nothingRunning);
	const state =
		cases.get(SESSION_CASE)?.members[FIRST_CASE_COHORT_MEMBER_INDEX]?.run
			.savedState;
	expect(state?.state).toBe("unavailable");
	if (state?.state !== "unavailable") {
		throw new Error("No unavailable saved-state assessment");
	}

	expect(state.reason).toContain("could not be read");
	expect(state.reason).toContain("Unrecognized key");
	expect(state.reason).toContain("<path>");
	expect(state.reason).not.toContain("/Users/private");
}

describe(readCaseRuns.name, () => {
	it(
		"preserves a session's recorded success while exposing its failed saved-state layer",
		verifyReadCaseRunsPreservesASessionSRecordedSuccessWhileExposingItsFailedSavedStateLayer,
	);
	it(
		"reads a session cohort repetition's saved-state layer from its saved attempt",
		verifyReadCaseRunsReadsASessionCohortRepetitionSSavedStateLayerFromItsSavedAttempt,
	);
	it(
		"keeps a malformed session attempt's cause while redacting its absolute path",
		verifyReadCaseRunsKeepsAMalformedSessionAttemptSCauseWhileRedactingItsAbsolutePath,
	);
});
