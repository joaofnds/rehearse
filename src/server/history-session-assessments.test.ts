import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";

import {
	directorySource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import { rewriteHistorySessionAttempt } from "#server/history-record-test-fixture";
import {
	clearHistoryRoots,
	corpusDirectory,
	writtenHistoryGroup,
} from "#server/history-workspace-test-fixture";

import { runHistoryReport, runListing } from "./run-history";
import type { ConfirmationGroupRow } from "./run-history";

afterEach(clearHistoryRoots);

const PAIRED_SESSION_REP_COUNT = 2;

const NO_SUCCESSFUL_REPS = 0;

const SINGLE_SESSION_REP_COUNT = 1;

const FIRST_UNAVAILABLE_REP_INDEX = 0;

const SECOND_UNAVAILABLE_REP_INDEX = 1;

const MALFORMED_STATE_ATTEMPT = {
	schemaVersion: 3,
	stateResults: [
		{
			"/Users/private/saved-state-secret": true,
			detail: "present",
			name: "saved",
			status: "PASS",
		},
	],
};

describe(runHistoryReport.name, () => {
	describe("when a session group has state check evidence", () => {
		it(
			"keeps session-group recorded outcomes separate from saved-state attempts and unavailable evidence",
			verifyKeepsSessionGroupRecordedOutcomesSeparateFromSavedState,
		);
	});
});

describe(runListing.name, () => {
	describe("when unrelated context evidence is malformed", () => {
		it(
			"reads a session group's saved state despite malformed unrelated context evidence",
			verifyReadsASessionGroupSSavedStateDespiteMalformed,
		);
	});
});

describe(runHistoryReport.name, () => {
	describe("when session attempt evidence is unavailable", () => {
		it(
			"keeps missing and malformed session-group attempts outside assessed totals",
			verifyKeepsMissingAndMalformedSessionGroupAttemptsOutsideAssessed,
		);

		it(
			"redacts private paths from malformed session-group attempt causes",
			verifyRedactsPrivatePathsFromMalformedSessionGroupAttemptCauses,
		);
	});
});

async function verifyKeepsSessionGroupRecordedOutcomesSeparateFromSavedState(): Promise<void> {
	const {
		fixture,
		paths,
		reps: [first, second],
	} = await writtenHistoryGroup("state-group", PAIRED_SESSION_REP_COUNT);
	await rewriteHistorySessionAttempt(paths.rep(first).attemptFile, {
		schemaVersion: 3,
		stateResults: [
			{ detail: "changed history", name: "history", status: "FAIL" },
		],
	});
	await rewriteHistorySessionAttempt(paths.rep(second).attemptFile, {
		schemaVersion: 3,
		stateResults: [{ detail: "kept history", name: "history", status: "PASS" }],
	});

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);
	const row = rows.find(
		(entry) => entry.kind === "group" && entry.groupId === "state-group",
	);

	expect(row).toHaveProperty("successful", NO_SUCCESSFUL_REPS);
	expect(row).toHaveProperty("savedState", {
		assessed: 2,
		disagreements: 1,
		failed: 1,
		passed: 1,
		total: 2,
		unavailable: 0,
		unavailableReps: [],
	});
}

async function verifyReadsASessionGroupSSavedStateDespiteMalformed(): Promise<void> {
	const {
		fixture,
		paths,
		reps: [rep],
	} = await writtenHistoryGroup(
		"state-without-context",
		SINGLE_SESSION_REP_COUNT,
	);
	await rewriteHistorySessionAttempt(paths.rep(rep).attemptFile, {
		contextEvidence: "malformed unrelated evidence",
		schemaVersion: 3,
		stateResults: [{ detail: "kept history", name: "history", status: "PASS" }],
	});

	const { rows } = await runListing(fixture.runsDirectory, nothingRunning);

	expect(
		rows.find(
			(row) => row.kind === "group" && row.groupId === "state-without-context",
		),
	).toMatchObject({
		savedState: { assessed: 1, passed: 1, total: 2, unavailable: 1 },
	});
}

async function verifyKeepsMissingAndMalformedSessionGroupAttemptsOutsideAssessed(): Promise<void> {
	const {
		fixture,
		paths,
		reps: [first, second],
	} = await writtenHistoryGroup("unavailable-state", PAIRED_SESSION_REP_COUNT);
	await rewriteHistorySessionAttempt(
		paths.rep(first).attemptFile,
		MALFORMED_STATE_ATTEMPT,
	);
	await rm(paths.rep(second).attemptFile);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);
	const row = rows.find(
		(entry): entry is ConfirmationGroupRow =>
			entry.kind === "group" && entry.groupId === "unavailable-state",
	);

	expect(row).toMatchObject({
		savedState: {
			assessed: 0,
			disagreements: 0,
			failed: 0,
			passed: 0,
			total: 2,
			unavailable: 2,
		},
		successful: 0,
	});
	expect(
		row?.savedState?.unavailableReps[SECOND_UNAVAILABLE_REP_INDEX],
	).toEqual({
		reason: "No saved session attempt was recorded.",
		repId: second,
	});
}

async function verifyRedactsPrivatePathsFromMalformedSessionGroupAttemptCauses(): Promise<void> {
	const {
		fixture,
		paths,
		reps: [first, second],
	} = await writtenHistoryGroup("unavailable-state", PAIRED_SESSION_REP_COUNT);
	await rewriteHistorySessionAttempt(
		paths.rep(first).attemptFile,
		MALFORMED_STATE_ATTEMPT,
	);
	await rm(paths.rep(second).attemptFile);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);
	const row = rows.find(
		(entry): entry is ConfirmationGroupRow =>
			entry.kind === "group" && entry.groupId === "unavailable-state",
	);

	expect(
		row?.savedState?.unavailableReps[FIRST_UNAVAILABLE_REP_INDEX]?.reason,
	).toContain("Unrecognized key");
	expect(
		row?.savedState?.unavailableReps[FIRST_UNAVAILABLE_REP_INDEX]?.reason,
	).toContain("<path>");
	expect(
		row?.savedState?.unavailableReps[FIRST_UNAVAILABLE_REP_INDEX]?.reason,
	).not.toContain("/Users/private");
}
