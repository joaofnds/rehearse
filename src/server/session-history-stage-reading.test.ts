import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";
import { readStageHistory } from "#server/session-history-reader";
import {
	writeHistoryCheckpoint,
	writtenStage,
} from "#server/session-history-stage-test-fixture";
import { clearSessionHistoryRoots } from "#server/session-history-workspace-test-fixture";

afterEach(clearSessionHistoryRoots);

describe(readStageHistory.name, () => {
	describe("when the checkpoint and transcript are saved", () => {
		it(
			"renders a stage's events in source order under a stage identity",
			verifyRendersAStageSEventsInSourceOrderUnder,
		);

		it(
			"keeps two stages of one run and one stage across two runs separate",
			verifyKeepsTwoStagesOfOneRunAndOneStage,
		);

		it(
			"leaves the checkpoint and its transcript byte-identical",
			verifyLeavesTheCheckpointAndItsTranscriptByteIdentical,
		);
	});

	describe("when the checkpoint records unavailable or absent capture", () => {
		it(
			"names a stage recording no provider transcript apart from one recording no capture",
			verifyNamesAStageRecordingNoProviderTranscriptApartFrom,
		);
	});

	describe("when a recorded transcript file is missing", () => {
		it(
			"names a checkpoint claiming a transcript whose file is gone",
			verifyNamesACheckpointClaimingATranscriptWhoseFileIs,
		);
	});
});

async function verifyRendersAStageSEventsInSourceOrderUnder(): Promise<void> {
	const fixture = await writtenStage();

	const report = await readStageHistory(fixture);

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
		lineage: "lineage-1",
		model: "sonnet",
		run: fixture.run,
		stage: "shape",
		upstream: "upstream-1",
	});
	expect(report.evidence).toEqual({ state: "complete" });
	expect(report.boundary).toBe("known");
	expect(report.startingContext).toEqual([]);
	expect(report.attemptEvents.map(({ id, state }) => ({ id, state }))).toEqual([
		{ id: "1:1", state: "invoked" },
		{ id: "2:1", state: "delivered" },
	]);
	expect(report.sources.map(({ kind, name }) => ({ kind, name }))).toEqual([
		{ kind: "corpus", name: "CLAUDE.md" },
	]);
}

async function verifyNamesAStageRecordingNoProviderTranscriptApartFrom(): Promise<void> {
	const recorded = await readStageHistory(
		await writtenStage({ transcript: "unavailable" }),
	);
	const absent = await readStageHistory(
		await writtenStage({ transcript: "absent" }),
	);

	expect(recorded.evidence).toEqual({
		reasons: ["the provider wrote no transcript for this stage session"],
		state: "unavailable",
	});
	expect(absent.evidence).toEqual({
		reasons: ["no raw transcript capture was recorded for this stage"],
		state: "unavailable",
	});
	expect(recorded.attemptEvents).toEqual([]);
	expect(absent.attemptEvents).toEqual([]);
}

async function verifyKeepsTwoStagesOfOneRunAndOneStage(): Promise<void> {
	const fixture = await writtenStage();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
	await writeHistoryCheckpoint({
		declared: {
			artifacts: [],
			corpusFiles: [],
			lineage: "lineage-2",
			model: "sonnet",
			stage: "build",
			targetSha: "target-sha",
			upstream: "lineage-1",
			workflowState: [],
		},
		directory: paths.checkpointDirectory("build"),
		transcript: JSON.stringify({
			cwd: "/wt",
			message: {
				content: [
					{
						id: "read-9",
						input: { file_path: "/wt/only-in-build.ts" },
						name: "Read",
						type: "tool_use",
					},
				],
			},
			type: "assistant",
		}),
	});
	const otherRun = await writtenStage();

	const [firstStage, secondStage, sameStageOtherRun] = await Promise.all([
		readStageHistory(fixture),
		readStageHistory({ ...fixture, stage: "build" }),
		readStageHistory(otherRun),
	]);

	expect([
		firstStage.sources.map(({ name }) => name),
		sameStageOtherRun.sources.map(({ name }) => name),
	]).toEqual([["CLAUDE.md"], ["CLAUDE.md"]]);
	expect(secondStage.sources.map(({ name }) => name)).toEqual([
		"only-in-build.ts",
	]);
	expect(firstStage.attempt).not.toEqual(secondStage.attempt);
	expect(firstStage.attemptEvents).toEqual(sameStageOtherRun.attemptEvents);
	expect(firstStage.attemptEvents).not.toBeEmpty();
}

async function verifyNamesACheckpointClaimingATranscriptWhoseFileIs(): Promise<void> {
	const fixture = await writtenStage();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
	await rm(join(paths.checkpointDirectory(fixture.stage), "transcript.jsonl"));

	const report = await readStageHistory(fixture);

	expect(report.evidence).toEqual({
		reasons: [
			"the checkpoint records a transcript whose file is no longer beside it",
		],
		state: "unavailable",
	});
	expect(report.attemptEvents).toEqual([]);
}

async function verifyLeavesTheCheckpointAndItsTranscriptByteIdentical(): Promise<void> {
	const fixture = await writtenStage();
	const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
	const directory = paths.checkpointDirectory(fixture.stage);
	const before = await Promise.all(
		["checkpoint.json", "transcript.jsonl"].map(
			async (name) => await Bun.file(join(directory, name)).text(),
		),
	);

	await readStageHistory(fixture);

	expect(
		await Promise.all(
			["checkpoint.json", "transcript.jsonl"].map(
				async (name) => await Bun.file(join(directory, name)).text(),
			),
		),
	).toEqual(before);
}
