import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { directorySource } from "#benchmark/run-records-test-support";
import type { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import { claimShortId } from "#benchmark/short-id";
import { readRunHistoryResponse } from "#server/api-test-driver";
import { runHistoryResponseFrom } from "#server/api-test-responses";
import { ApiTestWorkspace } from "#server/api-test-workspace";

const APPENDED_RUN_CLAIM_COUNT = 1;

const workspace = new ApiTestWorkspace();

afterEach(async () => {
	await workspace.dispose();
});

async function claimAndWrite(
	fixture: Readonly<RecordedRunsFixture>,
	run: string,
): Promise<void> {
	await claimShortId(fixture.runsDirectory, "audit-log", {
		kind: "run",
		run,
	});
	await fixture.pipeline.writePipelineRun({ caseId: "audit-log", run });
}

interface ClaimedHistory {
	readonly fixture: RecordedRunsFixture;
	readonly corpus: string;
}

async function claimedHistory(): Promise<ClaimedHistory> {
	const fixture = await workspace.writtenFixture();
	const corpus = await workspace.corpusDirectory();
	await fixture.claim("audit-log", fixture.auditLogClaims);
	await claimAndWrite(fixture, "2026-09-11T00-00-00.000Z");

	return { corpus, fixture };
}

describe("GET /api/runs", () => {
	it(
		"renders every recorded run as a row",
		verifyRendersEveryRecordedRunAsARow,
	);

	it(
		"returns exactly the rows the ids parameter names",
		verifyReturnsExactlyTheRowsTheIdsParameterNames,
	);

	it(
		"keeps each claimed record's short id after a restart and a later claim",
		verifyKeepsEachClaimedRecordSShortIdAfterA,
	);

	it(
		"names a replay's checkpoint and attempt with their recorded short ids",
		verifyNamesAReplaySCheckpointAndAttemptWithTheir,
	);

	it(
		"renders an empty runs directory as no rows, not an error",
		verifyRendersAnEmptyRunsDirectoryAsNoRowsNot,
	);
});

async function verifyRendersEveryRecordedRunAsARow(): Promise<void> {
	const { fixture, corpus, app } = await workspace.serving();
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));

	const { response, body } = await readRunHistoryResponse(app);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(body.rows.some((row) => row.run === fixture.replayableRun)).toBe(true);
}

async function verifyReturnsExactlyTheRowsTheIdsParameterNames(): Promise<void> {
	const { fixture, app } = await workspace.serving();
	const otherRun = "2026-09-12T00-00-00.000Z";
	await fixture.pipeline.writePipelineRun({
		caseId: "audit-log",
		run: otherRun,
	});

	const response = await app.selectedRuns([
		[`run:${otherRun}`, "group:absent"],
		[`run:${fixture.replayableRun}`],
	]);
	const body = await runHistoryResponseFrom(response);

	expect(body.rows.map((row) => row.kind === "run" && row.run)).toEqual([
		otherRun,
		fixture.replayableRun,
	]);
}

async function verifyKeepsEachClaimedRecordSShortIdAfterA(): Promise<void> {
	const { fixture, corpus } = await claimedHistory();
	const first = await workspace.start({
		runsDirectory: fixture.runsDirectory,
		source: directorySource(corpus),
	});
	const before = await first.claimedRows();

	await claimShortId(fixture.runsDirectory, "audit-log", {
		kind: "run",
		run: "2026-09-12T00-00-00.000Z",
	});
	await fixture.pipeline.writePipelineRun({
		caseId: "audit-log",
		run: "2026-09-12T00-00-00.000Z",
	});
	const restarted = await workspace.start({
		runsDirectory: fixture.runsDirectory,
		source: directorySource(corpus),
	});
	const after = await restarted.claimedRows();

	expect(after).toHaveLength(before.length + APPENDED_RUN_CLAIM_COUNT);
	expect(after).toContainValues([...before]);
}

async function verifyNamesAReplaySCheckpointAndAttemptWithTheir(): Promise<void> {
	const { fixture, corpus } = await claimedHistory();
	const app = await workspace.start({
		runsDirectory: fixture.runsDirectory,
		source: directorySource(corpus),
	});
	const before = await app.claimedRows();

	await claimShortId(fixture.runsDirectory, "audit-log", {
		kind: "run",
		run: "2026-09-12T00-00-00.000Z",
	});
	await fixture.pipeline.writePipelineRun({
		caseId: "audit-log",
		run: "2026-09-12T00-00-00.000Z",
	});
	const restarted = await workspace.start({
		runsDirectory: fixture.runsDirectory,
		source: directorySource(corpus),
	});
	await restarted.claimedRows();

	expect(
		before.find(
			(row) => row.kind === "replay" && row["shortId"] === "audit-log/r3",
		),
	).toMatchObject({
		attempt: { count: 2, position: 2 },
		checkpointShortId: "audit-log/r2/s1",
		kind: "replay",
		shortId: "audit-log/r3",
	});
}

async function verifyRendersAnEmptyRunsDirectoryAsNoRowsNot(): Promise<void> {
	const root = await workspace.emptyDirectory("rehearse-api-empty-");
	const corpusRoot = await workspace.corpusDirectory();
	const app = await workspace.start({
		runsDirectory: root,
		source: directorySource(corpusRoot),
	});

	const { response, body } = await readRunHistoryResponse(app);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(body.rows).toEqual([]);
}
