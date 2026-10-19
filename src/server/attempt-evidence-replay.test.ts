import { afterEach, describe, expect, it } from "bun:test";
import { dirname, join } from "node:path";

import { runNameFromTimestamp } from "#benchmark/run-layout";
import {
	REPLAY_SCORECARD,
	clearAttemptEvidenceRoots,
	fixture,
	replayId,
	savedReplayRecord,
} from "#server/attempt-evidence-test-fixture";

import { readAttemptEvidence } from "./attempt-evidence";
import expectHistoryError from "./evidence-test-support";

afterEach(clearAttemptEvidenceRoots);

async function verifyReadsAnISOTimestampSavedUnderTheReplayProducerSFilename(): Promise<void> {
	const saved = await fixture();
	const replay = await savedReplayRecord(saved);
	const timestamp = "2026-10-01T12:34:56.789Z";
	const fileTimestamp = runNameFromTimestamp(timestamp);
	await Bun.write(
		join(dirname(saved.stageAttemptFile), `${fileTimestamp}.json`),
		JSON.stringify({ ...replay, timestamp }),
	);

	const result = await readAttemptEvidence({
		id: `attempt:stage:${replay.consumed.lineage}/${fileTimestamp}`,
		runsDirectory: saved.runsDirectory,
	});

	expect(result).toMatchObject({
		kind: "stage",
		stage: replay.stage,
		state: "available",
	});
}

async function verifyReplayIdentity(
	field: "lineage" | "timestamp",
): Promise<void> {
	const saved = await fixture();
	const replay = await savedReplayRecord(saved);
	await Bun.write(
		saved.stageAttemptFile,
		JSON.stringify(
			field === "lineage"
				? {
						...replay,
						consumed: { ...replay.consumed, lineage: "different" },
					}
				: { ...replay, timestamp: "different" },
		),
	);

	await expectHistoryError(
		readAttemptEvidence({
			id: replayId(saved),
			runsDirectory: saved.runsDirectory,
		}),
		"refused",
	);
}

async function verifyRefusesAReplayScorecardForAnotherStage(): Promise<void> {
	const saved = await fixture();
	const replay = await savedReplayRecord(saved);
	await Bun.write(
		saved.stageAttemptFile,
		JSON.stringify({
			...replay,
			scorecard: { ...replay.scorecard, stage: "another-stage" },
		}),
	);

	await expectHistoryError(
		readAttemptEvidence({
			id: replayId(saved),
			runsDirectory: saved.runsDirectory,
		}),
		"refused",
	);
}

async function verifyRetainsSummaryOnlyReplayGradesWithoutInventingDetailedFindings(): Promise<void> {
	const saved = await fixture();

	const result = await readAttemptEvidence({
		id: replayId(saved),
		runsDirectory: saved.runsDirectory,
	});

	expect(result).toMatchObject({
		assessment: { detailed: false, grade: "A", requirements: [] },
		kind: "stage",
		state: "available",
	});
}

async function verifyProjectsSavedReplayOutputAndCitationsWhilePreservingTheDistinctionBetweenConsumedAndResultingLineage(): Promise<void> {
	const saved = await fixture();
	const replay = await savedReplayRecord(saved);
	await Bun.write(
		saved.stageAttemptFile,
		JSON.stringify({
			...replay,
			scorecard: { ...replay.scorecard, ...REPLAY_SCORECARD },
		}),
	);

	const result = await readAttemptEvidence({
		id: replayId(saved),
		runsDirectory: saved.runsDirectory,
	});

	expect(replay.lineage).not.toBe(replay.consumed.lineage);
	expect(result).toMatchObject({
		assessment: {
			detailed: true,
			grade: "C",
			requirements: [
				{
					evidence: [
						{
							claim: "The public field is absent",
							place: "delivery.md:1",
							quote: "retained output",
						},
					],
					id: "response",
					status: "FAIL",
				},
			],
			summary: "The response omitted hasMore.",
		},
		completionReply: "Completed reply",
		diff: "The saved delivery diff",
		kind: "stage",
		output: {
			kind: "artifact",
			path: "delivery.md",
			state: "available",
			text: "The actual retained output",
		},
		stage: "build",
		state: "available",
	});
}

describe(readAttemptEvidence.name, () => {
	describe("when a replay record matches its saved identity", () => {
		it(
			"reads an ISO timestamp saved under the replay producer's filename",
			verifyReadsAnISOTimestampSavedUnderTheReplayProducerSFilename,
		);

		it(
			"retains summary-only replay grades without inventing detailed findings",
			verifyRetainsSummaryOnlyReplayGradesWithoutInventingDetailedFindings,
		);

		it(
			"projects saved replay output and citations while preserving the distinction between consumed and resulting lineage",
			verifyProjectsSavedReplayOutputAndCitationsWhilePreservingTheDistinctionBetweenConsumedAndResultingLineage,
		);
	});

	describe("when the saved replay identity differs", () => {
		it.each(["lineage", "timestamp"] as const)(
			"refuses a saved replay with a different %s",
			verifyReplayIdentity,
		);
	});

	describe("when the scorecard names another stage", () => {
		it(
			"refuses a replay scorecard for another stage",
			verifyRefusesAReplayScorecardForAnotherStage,
		);
	});
});
