import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";

import { openRunEventStore } from "#benchmark/run-events";
import {
	benchmarkRunPaths,
	runEventsDatabaseFile,
} from "#benchmark/run-layout";
import { directorySource } from "#benchmark/run-records-test-support";
import {
	firstEventShiftedBy,
	liveness,
	unnamedClaim,
} from "#server/history-claim-test-fixture";
import { pipelineRun } from "#server/history-record-test-fixture";
import {
	clearHistoryRoots,
	corpusDirectory,
	writtenFixture,
} from "#server/history-workspace-test-fixture";

import { runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

/**
 * The target a run claimed can be deleted or cease to be a git repository,
 * and the marker read shells out to git, so the probe throws. That is no
 * evidence the process is gone, so the run is not listed as ended, which
 * would offer a paid analysis of a run that may still be executing, and
 * blaming git for it on every page load names the wrong thing and never
 * stops.
 */
async function verifyTreatsARunWhoseTargetCannotBeReachedAs(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRun();

	const { rows, unreadable } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		{
			isAlive: () => true,
			readMarker: async () =>
				await Promise.reject(
					new Error("ENOENT: no such file or directory, posix_spawn 'git'"),
				),
		},
	);

	expect(pipelineRun(rows, fixture.runningRun)).toBeUndefined();
	expect(unreadable).toEqual([]);
}

/**
 * Reconciliation records the interruption only at the next server start, so
 * until then the row is derived from the dead claim and nothing is written.
 */
async function verifyListsARunAsINTERRUPTEDWhenTheProcessThat(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRun();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		liveness(false, fixture.runningRun),
	);

	expect(pipelineRun(rows, fixture.runningRun)).toMatchObject({
		caseId: "audit-log",
		links: [],
		progress: { state: "recorded" },
		status: "INTERRUPTED",
	});
}

async function verifyRecordsNothingForARunItListsAsINTERRUPTED(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRun();

	await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		liveness(false, fixture.runningRun),
	);

	const store = await openRunEventStore(
		runEventsDatabaseFile(fixture.runsDirectory),
	);
	const latest = store.latestEvent(fixture.runningRun);
	store.close();
	expect(latest?.kind).toBe("turn-completed");
}

async function verifyTreatsARunInFlightWhoseManifestIsGone(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRun();
	await rm(
		benchmarkRunPaths(fixture.runsDirectory, fixture.runningRun).manifestFile,
	);

	const { rows, unreadable } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		liveness(false, fixture.runningRun),
	);

	expect(pipelineRun(rows, fixture.runningRun)).toBeUndefined();
	expect(unreadable).toEqual([]);
}

/**
 * A target with no claim marker has no run on it, so a run whose stream
 * never finished ended without recording how. Reconciliation reads the same
 * absence as "nothing to reconcile" and leaves the run alone, which is why
 * this reader cannot borrow that answer.
 */
async function verifyListsARunAsINTERRUPTEDWhenItsTargetCarries(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRun();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		{
			isAlive: () => true,
			readMarker: async () => {
				await Promise.try((): undefined => undefined);
			},
		},
	);

	expect(pipelineRun(rows, fixture.runningRun)?.status).toBe("INTERRUPTED");
}

async function verifyReportsTheRunAsRUNNINGWhenTheClaimCame(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRun();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		unnamedClaim(
			await firstEventShiftedBy({
				ms: -1,
				run: fixture.runningRun,
				runsDirectory: fixture.runsDirectory,
			}),
		),
	);

	expect(pipelineRun(rows, fixture.runningRun)?.status).toBe("RUNNING");
}

async function verifyListsTheRunAsINTERRUPTEDWhenTheClaimCame(): Promise<void> {
	const fixture = await writtenFixture();
	await fixture.events.writeRunningRun();

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		unnamedClaim(
			await firstEventShiftedBy({
				ms: 1,
				run: fixture.runningRun,
				runsDirectory: fixture.runsDirectory,
			}),
		),
	);

	expect(pipelineRun(rows, fixture.runningRun)?.status).toBe("INTERRUPTED");
}

describe("history process claims", () => {
	it(
		"treats a run whose target cannot be reached as not running, not unreadable",
		verifyTreatsARunWhoseTargetCannotBeReachedAs,
	);

	it(
		"lists a run as INTERRUPTED when the process that claimed its target is gone",
		verifyListsARunAsINTERRUPTEDWhenTheProcessThat,
	);

	it(
		"records nothing for a run it lists as INTERRUPTED from a gone claim",
		verifyRecordsNothingForARunItListsAsINTERRUPTED,
	);

	it(
		"treats a run in flight whose manifest is gone as not running, since nothing names its target",
		verifyTreatsARunInFlightWhoseManifestIsGone,
	);

	it(
		"lists a run as INTERRUPTED when its target carries no claim marker",
		verifyListsARunAsINTERRUPTEDWhenItsTargetCarries,
	);

	describe("when the claim on the run's target names no run", () => {
		it(
			"reports the run as RUNNING when the claim came just before its first event",
			verifyReportsTheRunAsRUNNINGWhenTheClaimCame,
		);

		it(
			"lists the run as INTERRUPTED when the claim came just after its first event",
			verifyListsTheRunAsINTERRUPTEDWhenTheClaimCame,
		);
	});
});
