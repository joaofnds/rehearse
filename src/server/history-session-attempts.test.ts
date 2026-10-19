import { afterEach, describe, expect, it } from "bun:test";

import type { Immutable } from "#benchmark/contracts";
import {
	directorySource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import { parseSessionAttemptRecord } from "#benchmark/session-record";
import {
	clearHistoryRoots,
	corpusDirectory,
	writtenFixture,
} from "#server/history-workspace-test-fixture";

import { runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

const INITIAL_REPORT_CASE_INDEX = 0;

const SESSION_STATE_READINGS = [
	{
		changes: {},
		label: "legacy missing fields",
		savedState: {
			reason: "No saved state assessment was recorded; declaration is unknown.",
			state: "unavailable",
		},
	} as const,
	{
		changes: {
			schemaVersion: 3,
			stateGradingError: "scorer exited without usable output",
		},
		label: "a grading error",
		savedState: {
			reason: "scorer exited without usable output",
			state: "unavailable",
		},
	} as const,
	{
		changes: { schemaVersion: 3, stateResults: [] },
		label: "no recorded outcomes",
		savedState: {
			reason: "No saved state check outcomes were recorded.",
			state: "unavailable",
		},
	} as const,
	{
		changes: {
			schemaVersion: 3,
			stateResults: [
				{ detail: "history preserved", name: "history", status: "PASS" },
			],
		},
		label: "passing state checks",
		savedState: { failed: 0, passed: 1, state: "assessed", total: 1 },
	} as const,
];

describe(runHistoryReport.name, () => {
	describe("when a session attempt record is available", () => {
		it.each(SESSION_STATE_READINGS)(
			"projects $label without inventing declaration or changing recorded success",
			verifySessionStateReadings,
		);

		it(
			"keeps successful reply checks and failed saved-state checks as separate recorded layers",
			verifyKeepsSuccessfulReplyChecksAndFailedSavedStateChecks,
		);

		it(
			"lists it as a row naming its case, uuid, and the page that opens its context",
			verifyListsItAsARowNamingItsCaseUuid,
		);
	});

	describe("when an attempt directory has no record", () => {
		it(
			"names an attempt directory with no record as unreadable by its record id",
			verifyNamesAnAttemptDirectoryWithNoRecordAsUnreadable,
		);
	});
});

async function verifyKeepsSuccessfulReplyChecksAndFailedSavedStateChecks(): Promise<void> {
	const fixture = await writtenFixture();
	const record = parseSessionAttemptRecord(
		await Bun.file(fixture.sessionAttemptFile).text(),
	);
	await Bun.write(
		fixture.sessionAttemptFile,
		JSON.stringify({
			...record,
			schemaVersion: 3,
			stateResults: Array.from({ length: 19 }, (_unused, index) => ({
				detail: "saved state evidence",
				name: `state-${String(index)}`,
				status: index === INITIAL_REPORT_CASE_INDEX ? "PASS" : "FAIL",
			})),
		}),
	);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(rows.find((row) => row.kind === "session-attempt")).toMatchObject({
		checks: { declared: 1, passed: 1, state: "available" },
		savedState: { failed: 18, passed: 1, state: "assessed", total: 19 },
		status: "SUCCESSFUL",
	});
}

async function verifyListsItAsARowNamingItsCaseUuid(): Promise<void> {
	const fixture = await writtenFixture();
	const { caseId, uuid } = fixture.sessionAttempt;

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(rows.find((row) => row.kind === "session-attempt")).toMatchObject({
		caseId,
		links: [
			{
				href: `/attempts/session/${caseId}/${uuid}`,
				label: "context",
				state: "available",
			},
		],
		status: "SUCCESSFUL",
		uuid,
	});
}

async function verifyNamesAnAttemptDirectoryWithNoRecordAsUnreadable(): Promise<void> {
	const fixture = await writtenFixture();
	const uuid = "0f6b6f2a-0000-4000-8000-000000000002";
	await fixture.sessions.writeEmptyAttemptDirectory({
		caseId: "smoke",
		uuid,
	});

	const { rows, unreadable } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(
		rows.some((row) => row.kind === "session-attempt" && row.uuid === uuid),
	).toBe(false);
	expect(unreadable).toContainEqual({
		id: `attempt:session:smoke/${uuid}`,
		kind: "session-attempt",
		reason: "incomplete: no attempt.json recorded",
	});
}

async function verifySessionStateReadings({
	changes,
	savedState,
}: Immutable<(typeof SESSION_STATE_READINGS)[number]>): Promise<void> {
	const fixture = await writtenFixture();
	const record = parseSessionAttemptRecord(
		await Bun.file(fixture.sessionAttemptFile).text(),
	);
	await Bun.write(
		fixture.sessionAttemptFile,
		JSON.stringify({ ...record, ...changes }),
	);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(rows.find((row) => row.kind === "session-attempt")).toMatchObject({
		savedState,
		status: "SUCCESSFUL",
	});
}
