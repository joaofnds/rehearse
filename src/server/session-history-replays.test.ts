import { afterEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { replayRecordFile } from "#benchmark/run-layout";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";
import {
	SessionHistoryReaderError,
	readReplayHistory,
} from "#server/session-history-reader";
import {
	REPLAY_EXCHANGE_TEXT,
	REPLAY_SESSION_ID,
	writtenReplay,
} from "#server/session-history-replay-test-fixture";
import {
	clearSessionHistoryRoots,
	startHistoryApi,
} from "#server/session-history-workspace-test-fixture";

afterEach(clearSessionHistoryRoots);

describe(readReplayHistory.name, () => {
	describe("when a replay retains parsed exchanges", () => {
		it(
			"names a replay as retaining no raw capture under a stage identity",
			verifyNamesAReplayAsRetainingNoRawCaptureUnder,
		);

		it(
			"keeps a replay's parsed exchanges out of every event ledger",
			verifyKeepsAReplaySParsedExchangesOutOfEvery,
		);

		it(
			"refuses a replay record filed under another lineage",
			verifyRefusesAReplayRecordFiledUnderAnotherLineage,
		);

		it(
			"refuses a traversing lineage segment without leaking an absolute path",
			verifyRefusesATraversingLineageSegmentWithoutLeakingAnAbsolute,
		);
	});
});

describe("/api/replays/:lineage/:timestamp/history", () => {
	describe("GET", () => {
		it(
			"serves a replay's unavailable report",
			verifyServesAReplaySUnavailableReport,
		);

		it(
			"refuses a traversing replay lineage without leaking an absolute path",
			verifyRefusesATraversingReplayLineageWithoutLeakingAnAbsolute,
		);
	});
});

async function verifyNamesAReplayAsRetainingNoRawCaptureUnder(): Promise<void> {
	const fixture = await writtenReplay();

	const report = await readReplayHistory(fixture);

	expect(report.attempt).toEqual({
		caseId: "audit-log",
		corpusFiles: [
			{ path: "CLAUDE.md", sha256: "a".repeat(SHA256_HEX_DIGITS) },
			{
				path: "skills/build/SKILL.md",
				sha256: "b".repeat(SHA256_HEX_DIGITS),
			},
		],
		kind: "stage",
		lineage: "lineage-build",
		model: "sonnet",
		run: "2026-09-06T21-58-29.508Z",
		stage: "build",
		upstream: "lineage-discuss",
	});
	expect(report.evidence).toEqual({
		reasons: ["a replay retains no raw transcript for its stage session"],
		state: "unavailable",
	});
}

async function verifyKeepsAReplaySParsedExchangesOutOfEvery(): Promise<void> {
	const fixture = await writtenReplay();

	const report = await readReplayHistory(fixture);

	expect(report.startingContext).toEqual([]);
	expect(report.attemptEvents).toEqual([]);
	expect(report.boundaryUnknown).toEqual([]);
	expect(report.sources).toEqual([]);
	expect(JSON.stringify(report)).not.toContain(REPLAY_SESSION_ID);
	expect(JSON.stringify(report)).not.toContain(REPLAY_EXCHANGE_TEXT);
}

async function verifyRefusesAReplayRecordFiledUnderAnotherLineage(): Promise<void> {
	const fixture = await writtenReplay();
	const recordFile = replayRecordFile(
		fixture.runsDirectory,
		"lineage-other",
		fixture.timestamp,
	);
	await mkdir(join(fixture.runsDirectory, "replays", "lineage-other"), {
		recursive: true,
	});
	await Bun.write(
		recordFile,
		await Bun.file(
			replayRecordFile(
				fixture.runsDirectory,
				fixture.lineage,
				fixture.timestamp,
			),
		).text(),
	);

	expect(
		readReplayHistory({
			lineage: "lineage-other",
			runsDirectory: fixture.runsDirectory,
			timestamp: fixture.timestamp,
		}),
	).rejects.toThrow(SessionHistoryReaderError);
}

async function verifyRefusesATraversingLineageSegmentWithoutLeakingAnAbsolute(): Promise<void> {
	const fixture = await writtenReplay();

	expect(
		readReplayHistory({
			lineage: "../escape",
			runsDirectory: fixture.runsDirectory,
			timestamp: fixture.timestamp,
		}),
	).rejects.toThrow(SessionHistoryReaderError);
}

async function verifyServesAReplaySUnavailableReport(): Promise<void> {
	const fixture = await writtenReplay();
	const api = await startHistoryApi(fixture.runsDirectory);

	const response = await api.savedEvidence.replayHistory(fixture);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toMatchObject({
		attempt: { kind: "stage", stage: "build" },
		evidence: {
			reasons: ["a replay retains no raw transcript for its stage session"],
			state: "unavailable",
		},
	});
}

async function verifyRefusesATraversingReplayLineageWithoutLeakingAnAbsolute(): Promise<void> {
	const fixture = await writtenReplay();
	const api = await startHistoryApi(fixture.runsDirectory);

	const response = await api.savedEvidence.replayHistory({
		...fixture,
		lineage: "../escape",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
	expect(JSON.stringify(await response.json())).not.toContain(
		fixture.runsDirectory,
	);
}
