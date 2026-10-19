import { afterEach, describe, expect, it } from "bun:test";

import { directorySource } from "#benchmark/run-records-test-support";
import { liveness } from "#server/history-claim-test-fixture";
import { pipelineRun } from "#server/history-record-test-fixture";
import {
	clearHistoryRoots,
	corpusDirectory,
	writtenFixture,
} from "#server/history-workspace-test-fixture";

import { runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

async function verifyDoesNotReportAFinishedRunAsRunningWhatever(): Promise<void> {
	const fixture = await writtenFixture();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		{
			isAlive: () => true,
			readMarker: async () =>
				await Promise.resolve({
					pid: 4242,
					startedAt: "2026-09-01T00:00:00.000Z",
				}),
		},
	);

	expect(
		rows.map((row) => (row.kind === "group" ? undefined : row.status)),
	).not.toContain("RUNNING");
}

/**
 * A target keeps its claim marker until the run restores it, and an
 * interrupted run never got to. So a live marker sits beside an already
 * terminal event stream, and only the event kind separates the two.
 */
async function verifyKeepsReportingAnInterruptedRunAsINTERRUPTEDWhileIts(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeInterruptedRun();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		liveness(true, fixture.interruptedRun),
	);

	const row = pipelineRun(rows, fixture.interruptedRun);
	expect(row).toMatchObject({ status: "INTERRUPTED" });
}

/**
 * A signal abort records a terminal `run-failed` and writes no artifact, so
 * nothing above the running check claims this run. Its target keeps the
 * claim marker the aborted run never restored, which is a live pid beside a
 * finished run: only the event kind tells them apart.
 */
async function verifyDoesNotReportASignalAbortedRunAsRunning(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeSignalAbortedRun();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		liveness(true, fixture.abortedRun),
	);

	expect(pipelineRun(rows, fixture.abortedRun)).toMatchObject({
		caseId: "audit-log",
		links: [
			{
				label: "build",
				reason: "failed before saving its context",
				state: "unavailable",
			},
		],
		status: "FAILED",
	});
}

describe("history terminal claims", () => {
	it(
		"does not report a finished run as running, whatever the target's marker says",
		verifyDoesNotReportAFinishedRunAsRunningWhatever,
	);

	it(
		"keeps reporting an interrupted run as INTERRUPTED while its target's marker is still live",
		verifyKeepsReportingAnInterruptedRunAsINTERRUPTEDWhileIts,
	);

	it(
		"does not report a signal-aborted run as running though its target's marker is still live",
		verifyDoesNotReportASignalAbortedRunAsRunning,
	);
});
