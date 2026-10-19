import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import {
	RecordedRunsFixture,
	directorySource,
	liveStageSettings,
} from "#benchmark/run-records-test-support";
import {
	attemptsApi,
	clearStageAttemptRoots,
	corpusDirectory,
	fixtureWithReplayAndRep,
	temporaryRoot,
} from "#server/stage-attempt-test-fixture";

import { SessionHistoryReaderError } from "./session-history-reader";
import type { StageAttempt } from "./stage-attempts";
import readStageAttempts from "./stage-attempts";

/** What the list shows of an attempt's staleness. */
function staleReading(attempt: StageAttempt): boolean | readonly string[] {
	return attempt.staleness.state === "available"
		? attempt.staleness.stale
		: attempt.staleness.reasons;
}

/** The grade an attempt's own record carries; the original's is the run record's. */
function recordedGrade(attempt: StageAttempt): string | undefined {
	return "grade" in attempt ? attempt.grade : undefined;
}

describe(readStageAttempts.name, () => {
	it(
		"lists the original run, a replay and a judged rep at the checkpoint a stage started from, in claim order",
		verifyReadStageAttemptsNameListsTheOriginalRunAReplayAndAJudgedRepAtTheCheckpointAStageStartedFromInClaimOrder,
	);

	it(
		"names the initial checkpoint for the first stage and lists the original alone when nothing else ran from it",
		verifyReadStageAttemptsNameNamesTheInitialCheckpointForTheFirstStageAndListsTheOriginalAloneWhenNothingElseRanFromIt,
	);

	it(
		"judges the original attempt at a stage that stopped the run under the run's own id",
		verifyReadStageAttemptsNameJudgesTheOriginalAttemptAtAStageThatStoppedTheRunUnderTheRunSOwnId,
	);

	it(
		"refuses a stage the run's pipeline does not hold",
		verifyReadStageAttemptsNameRefusesAStageTheRunSPipelineDoesNotHold,
	);
});

describe("/api/runs/:run/stages/:stage/attempts", () => {
	it("answers the checkpoint a stage started from and its attempts", async () => {
		const { api, run } = await attemptsApi();

		const found = await api.savedEvidence.stageAttempts({
			run,
			stage: "build",
		});

		expect(found.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
		expect(await found.json()).toMatchObject({
			attempts: [
				{
					href: `/runs/${encodeURIComponent(run)}?view=results&step=build`,
					id: "audit-log/r2",
					kind: "original",
				},
				{
					grade: "A",
					href: "/replays/lineage-discuss/2026-09-03T01-00-00.000Z",
					id: "audit-log/r3",
					kind: "replay",
				},
				{
					grade: "A",
					href: "/groups/group-at-build/reps/group-at-build-rep-1/attempt",
					id: "audit-log/g5 rep 1",
					kind: "rep",
				},
			],
			checkpoint: "audit-log/r2/s1",
		});
	});

	it("answers 404 for a stage the run's pipeline does not hold", async () => {
		const { api, run } = await attemptsApi();

		const missing = await api.savedEvidence.stageAttempts({
			run,
			stage: "deploy",
		});

		expect(missing.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
	});
});

async function verifyReadStageAttemptsNameListsTheOriginalRunAReplayAndAJudgedRepAtTheCheckpointAStageStartedFromInClaimOrder(): Promise<void> {
	const fixture = await fixtureWithReplayAndRep();

	const attempts = await readStageAttempts({
		run: fixture.replayableRun,
		runsDirectory: fixture.runsDirectory,
		source: directorySource(await corpusDirectory()),
		stage: "build",
	});

	expect(attempts.checkpoint).toBe("audit-log/r2/s1");
	expect(attempts.attempts.map(({ href }) => href)).toEqual([
		`/runs/${encodeURIComponent(fixture.replayableRun)}?view=results&step=build`,
		`/replays/${encodeURIComponent(fixture.stageAttempt.lineage)}/${encodeURIComponent(fixture.stageAttempt.timestamp)}`,
		"/groups/group-at-build/reps/group-at-build-rep-1/attempt",
	]);
	expect(attempts.attempts.map(({ kind, id }) => ({ id, kind }))).toEqual([
		{ id: "audit-log/r2", kind: "original" },
		{ id: "audit-log/r3", kind: "replay" },
		{ id: "audit-log/g5 rep 1", kind: "rep" },
	]);
	expect(attempts.attempts.map(recordedGrade)).toEqual([undefined, "A", "A"]);
	expect(attempts.attempts.map(staleReading)).toEqual([
		true,
		true,
		["the group froze no pipeline to hash its stages against"],
	]);
}

async function verifyReadStageAttemptsNameNamesTheInitialCheckpointForTheFirstStageAndListsTheOriginalAloneWhenNothingElseRanFromIt(): Promise<void> {
	const fixture = await fixtureWithReplayAndRep();

	const attempts = await readStageAttempts({
		run: fixture.replayableRun,
		runsDirectory: fixture.runsDirectory,
		source: directorySource(await corpusDirectory()),
		stage: "discuss",
	});

	expect(attempts.checkpoint).toBe("audit-log/r2/s0");
	expect(attempts.attempts.map(({ kind, id }) => ({ id, kind }))).toEqual([
		{ id: "audit-log/r2", kind: "original" },
	]);
}

async function verifyReadStageAttemptsNameJudgesTheOriginalAttemptAtAStageThatStoppedTheRunUnderTheRunSOwnId(): Promise<void> {
	const fixture = new RecordedRunsFixture(
		await temporaryRoot("rehearse-stage-attempts-"),
		{ settingsFile: await liveStageSettings() },
	);
	await fixture.stopped.writeGradedStoppedRun();
	const corpus = await corpusDirectory();
	await fixture.corpus.recordStoppedStageFrom(directorySource(corpus));
	await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "edited\n");

	const attempts = await readStageAttempts({
		run: fixture.stoppedRun,
		runsDirectory: fixture.runsDirectory,
		source: directorySource(corpus),
		stage: "build",
	});

	expect(attempts.attempts.map(({ kind }) => kind)).toEqual(["original"]);
	const [observedFirstAttempt] = attempts.attempts;

	expect(observedFirstAttempt?.staleness).toMatchObject({
		causes: ["skills/build/SKILL.md changed"],
		stale: true,
		state: "available",
	});
}

async function verifyReadStageAttemptsNameRefusesAStageTheRunSPipelineDoesNotHold(): Promise<void> {
	const fixture = await fixtureWithReplayAndRep();

	const attempts = readStageAttempts({
		run: fixture.replayableRun,
		runsDirectory: fixture.runsDirectory,
		source: directorySource(await corpusDirectory()),
		stage: "deploy",
	});

	expect(attempts).rejects.toThrow(SessionHistoryReaderError);
}

afterEach(clearStageAttemptRoots);
