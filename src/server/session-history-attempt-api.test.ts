import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { rm, symlink } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { sessionAttemptPaths } from "#benchmark/run-layout";
import {
	writtenAttempt,
	writtenResumedAttempt,
} from "#server/session-history-attempt-test-fixture";
import {
	clearSessionHistoryRoots,
	startHistoryApi,
} from "#server/session-history-workspace-test-fixture";

afterEach(clearSessionHistoryRoots);

describe("/api/attempts/session/:caseId/:uuid/history", () => {
	describe("GET", () => {
		it(
			"serves summary and bounded event detail from the standalone route",
			verifyServesSummaryAndBoundedEventDetailFromTheStandalone,
		);

		it(
			"returns a redacted refusal for an invalid route identity",
			verifyReturnsARedactedRefusalForAnInvalidRouteIdentity,
		);
	});
});

describe("/api/attempts/session/:caseId/:uuid/history/requests", () => {
	describe("GET", () => {
		it(
			"serves the request series, its cost readings and instruction loads",
			verifyServesTheRequestSeriesItsCostReadingsAndInstruction,
		);

		it(
			"serves a per-request cost for each attempt-region request",
			verifyServesAPerRequestCostForEachAttemptRegion,
		);

		it(
			"leaves the record and transcript byte-identical across repeated series reads",
			verifyLeavesTheRecordAndTranscriptByteIdenticalAcrossRepeated,
		);

		it(
			"refuses a series read whose transcript is a symlink out of the attempt directory",
			verifyRefusesASeriesReadWhoseTranscriptIsASymlink,
		);
	});
});

async function verifyServesSummaryAndBoundedEventDetailFromTheStandalone(): Promise<void> {
	const fixture = await writtenAttempt();
	const api = await startHistoryApi(fixture.runsDirectory);

	const summary = await api.savedEvidence.sessionHistory(fixture);
	const detail = await api.savedEvidence.sessionDetail(fixture, "2:1");

	expect(summary.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(detail.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await detail.json()).toEqual({
		applicationTruncated: false,
		deliveredMeasurement: { characters: 22, state: "complete" },
		deliveredText: "1\tproject instructions",
		eventId: "2:1",
		kind: "result",
		locator: { block: 1, line: 2 },
		relatedEventIds: ["1:1"],
		schemaVersion: 1,
		snapshotMeasurement: {
			reasons: ["source snapshot unavailable"],
			state: "unavailable",
		},
		state: "delivered",
	});
}

async function verifyServesTheRequestSeriesItsCostReadingsAndInstruction(): Promise<void> {
	const fixture = await writtenResumedAttempt();
	const api = await startHistoryApi(fixture.runsDirectory);

	const response = await api.savedEvidence.sessionRequests(fixture);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toMatchObject({
		cost: {
			calculated: { state: "complete" },
			reported: { costUsd: 1.008294, state: "complete" },
		},
		instructionLoads: { state: "unavailable" },
		series: {
			attemptTotals: { state: "complete", totalInputTokens: 251_697 },
			boundary: "known",
			measuresActiveContextWindow: false,
			name: "total input tokens",
		},
	});
}

async function verifyServesAPerRequestCostForEachAttemptRegion(): Promise<void> {
	const fixture = await writtenResumedAttempt();
	const api = await startHistoryApi(fixture.runsDirectory);

	const response = await api.savedEvidence.sessionRequests(fixture);

	expect(await response.json()).toMatchObject({
		requestCosts: [{ cost: { costUsd: 1.008294, state: "priced" }, line: 2 }],
	});
}

async function verifyLeavesTheRecordAndTranscriptByteIdenticalAcrossRepeated(): Promise<void> {
	const fixture = await writtenResumedAttempt();
	const paths = sessionAttemptPaths(fixture.runsDirectory, fixture);
	const evidence = [
		paths.recordFile,
		join(paths.directory, "transcript.jsonl"),
	];
	const digests = async (): Promise<readonly string[]> =>
		await Promise.all(
			evidence.map(async (path) =>
				createHash("sha256")
					.update(await Bun.file(path).bytes())
					.digest("hex"),
			),
		);
	const before = await digests();
	const api = await startHistoryApi(fixture.runsDirectory);

	const responses = [
		await api.savedEvidence.sessionRequests(fixture),
		await api.savedEvidence.sessionRequests(fixture),
		await api.savedEvidence.sessionRequests(fixture),
	];

	expect(responses.map(({ status }) => status)).toEqual([
		HTTP_STATUS.HTTP_STATUS_OK,
		HTTP_STATUS.HTTP_STATUS_OK,
		HTTP_STATUS.HTTP_STATUS_OK,
	]);
	expect(await digests()).toEqual(before);
}

async function verifyRefusesASeriesReadWhoseTranscriptIsASymlink(): Promise<void> {
	const fixture = await writtenResumedAttempt();
	const paths = sessionAttemptPaths(fixture.runsDirectory, fixture);
	const outside = join(fixture.runsDirectory, "..", "outside.jsonl");
	await Bun.write(outside, "{}\n");
	await rm(paths.transcriptFile);
	await symlink(outside, paths.transcriptFile);
	const api = await startHistoryApi(fixture.runsDirectory);

	const response = await api.savedEvidence.sessionRequests(fixture);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
	expect(await response.json()).toEqual({
		error: "Saved-attempt evidence is not a real file",
	});
}

async function verifyReturnsARedactedRefusalForAnInvalidRouteIdentity(): Promise<void> {
	const fixture = await writtenAttempt();
	const api = await startHistoryApi(fixture.runsDirectory);

	const response = await api.savedEvidence.sessionHistory({
		...fixture,
		uuid: "bad../id",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
	expect(await response.text()).not.toContain(fixture.runsDirectory);
}
