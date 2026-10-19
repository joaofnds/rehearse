import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import {
	RecordedRunsFixture,
	STOPPED_STAGE_EXCHANGE_TEXT,
	STOPPED_STAGE_SESSION_ID,
} from "#benchmark/run-records-test-support";
import { readStageHistory } from "#server/session-history-reader";
import {
	clearSessionHistoryRoots,
	roots,
	writtenStoppedRun,
} from "#server/session-history-workspace-test-fixture";

const FIRST_RECORDED_LINE_NUMBER = 1;

afterEach(clearSessionHistoryRoots);

describe(readStageHistory.name, () => {
	describe("when the stopped stage has a manifest", () => {
		it(
			"names a stage the run stopped on rather than reporting it absent",
			verifyNamesAStageTheRunStoppedOnRatherThan,
		);

		it(
			"reads the transcript the harness kept beside a stopped stage's record",
			verifyReadsTheTranscriptTheHarnessKeptBesideAStopped,
		);

		it(
			"keeps a stopped stage's parsed exchanges out of every event ledger",
			verifyKeepsAStoppedStageSParsedExchangesOutOf,
		);

		it(
			"reads a stopped stage against a boundary it knows",
			verifyReadsAStoppedStageAgainstABoundaryItKnows,
		);

		it(
			"reports no lineage for a stopped stage rather than a derived one",
			verifyReportsNoLineageForAStoppedStageRatherThan,
		);
	});

	describe("when the stage or its run manifest is absent", () => {
		it.each([
			["a judged stage that did not stop", "discuss"],
			["a stage with no record at all", "nonexistent"],
		] as const)("reports %s as absent", async (_name, stage) => {
			const fixture = await writtenStoppedRun();

			expect(readStageHistory({ ...fixture, stage })).rejects.toMatchObject({
				kind: "not-found",
			});
		});

		it(
			"reports a stopped run whose manifest is missing as absent",
			verifyReportsAStoppedRunWhoseManifestIsMissingAs,
		);
	});
});

async function verifyNamesAStageTheRunStoppedOnRatherThan(): Promise<void> {
	const fixture = await writtenStoppedRun();

	const report = await readStageHistory(fixture);

	expect(report.attempt).toEqual({
		caseId: "audit-log",
		corpusFiles: [],
		error: "build stage graded F; minimum grade is B",
		kind: "stopped-stage",
		model: "sonnet",
		run: fixture.run,
		stage: "build",
	});
	expect(report.evidence).toEqual({
		reasons: ["this stage stopped before recording a transcript"],
		state: "unavailable",
	});
}

async function verifyReadsTheTranscriptTheHarnessKeptBesideAStopped(): Promise<void> {
	const fixture = await writtenStoppedRun();
	const kept = benchmarkRunPaths(
		fixture.runsDirectory,
		fixture.run,
	).stoppedSessionDirectory("build");
	await mkdir(kept, { recursive: true });
	await Bun.write(
		join(kept, "transcript.jsonl"),
		`${JSON.stringify({
			message: { content: "Build the audit log.", role: "user" },
			type: "user",
			uuid: "kept-1",
		})}\n`,
	);

	const report = await readStageHistory(fixture);

	expect(report.evidence).toEqual({ state: "complete" });
	expect(report.attemptEvents.map(({ locator }) => locator.line)).toEqual([
		FIRST_RECORDED_LINE_NUMBER,
	]);
}

async function verifyKeepsAStoppedStageSParsedExchangesOutOf(): Promise<void> {
	const fixture = await writtenStoppedRun();

	const report = await readStageHistory(fixture);

	expect(report.startingContext).toEqual([]);
	expect(report.attemptEvents).toEqual([]);
	expect(report.boundaryUnknown).toEqual([]);
	expect(report.sources).toEqual([]);
	expect(report.startingSources).toEqual([]);
	expect(JSON.stringify(report)).not.toContain(STOPPED_STAGE_SESSION_ID);
	expect(JSON.stringify(report)).not.toContain(STOPPED_STAGE_EXCHANGE_TEXT);
}

async function verifyReadsAStoppedStageAgainstABoundaryItKnows(): Promise<void> {
	const fixture = await writtenStoppedRun();

	const report = await readStageHistory(fixture);

	expect(report.boundary).toEqual("known");
}

async function verifyReportsNoLineageForAStoppedStageRatherThan(): Promise<void> {
	const fixture = await writtenStoppedRun();

	const report = await readStageHistory(fixture);

	expect(Object.keys(report.attempt)).not.toContain("lineage");
	expect(Object.keys(report.attempt)).not.toContain("upstream");
}

async function verifyReportsAStoppedRunWhoseManifestIsMissingAs(): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-stopped-reader-"));
	roots.push(root);
	const runsDirectory = join(root, ".benchmark-runs");
	const runs = new RecordedRunsFixture(runsDirectory);
	await runs.stopped.writeStoppedRunWithoutManifest();

	expect(
		readStageHistory({ run: runs.stoppedRun, runsDirectory, stage: "build" }),
	).rejects.toMatchObject({ kind: "not-found" });
}
