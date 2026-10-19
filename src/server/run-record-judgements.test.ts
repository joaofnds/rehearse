import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { z } from "zod";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import {
	clearRunRecordRoots,
	emptyFixture,
	runRecord,
} from "#server/run-record-workspace-test-fixture";

import type { RunRecord } from "./run-record";
import { AWAITING_GRADE_REASON, UNGRADED_BLOCKERS_REASON } from "./run-record";

const HUMAN_REVIEW_READINGS = [
	[
		"corrupt",
		"not-json",
		{
			reasons: ["The saved human review could not be read"],
			state: "unavailable",
		},
	],
	[
		"recorded",
		JSON.stringify({
			findings: [],
			summary: "The Judge agrees with the evidence.",
			verdict: "ACCEPT",
		}),
		{
			review: {
				findings: [],
				summary: "The Judge agrees with the evidence.",
				verdict: "ACCEPT",
			},
			state: "available",
		},
	],
] as const;

afterEach(clearRunRecordRoots);

describe("run record judgements", () => {
	it("serves an explicit absent human review reading", verifyAbsentHumanReview);

	it.each(HUMAN_REVIEW_READINGS)(
		"serves an explicit %s human review reading",
		verifyHumanReview,
	);

	describe(
		"the run and its stages",
		registerRunRecordJudgementsTheRunAndItsStages,
	);
});

async function verifyReportsAStageLeftAwaitingItsJudgeAsAwaiting(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeAwaitingJudgeRun();

	const response = await runRecord(fixture, fixture.awaitingJudgeRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{ stage: "discuss", status: "graded" },
			{
				grade: { reasons: [AWAITING_GRADE_REASON], state: "unavailable" },
				stage: "build",
				status: "awaiting-judgment",
				wallTime: {
					reasons: [AWAITING_GRADE_REASON],
					state: "unavailable",
				},
			},
		],
	});
}

async function verifyReportsAGradedStageSLetterWithItsVerdict(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{
				grade: { letter: "A", state: "available", verdict: "CONTINUE" },
				stage: "discuss",
			},
			{ stage: "build" },
		],
	});
}

async function verifyCountsAndNamesTheHardBlockersAStageS(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunWithReadings();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{
				blockers: {
					fired: 2,
					firedIds: ["no-secrets-in-diff", "no-unrelated-refactors"],
					state: "available",
					total: 3,
				},
				stage: "build",
			},
		],
	});
}

async function verifyCountsTheHardBlockersAScorecardKeepsInIts(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunWithReadings();
	const discuss = benchmarkRunPaths(
		fixture.runsDirectory,
		fixture.stoppedRun,
	).stageFile("discuss");
	const discussedStageRecord = z
		.object({})
		.loose()
		.parse(await Bun.file(discuss).json());
	await Bun.write(
		discuss,
		JSON.stringify({
			...discussedStageRecord,
			grade: {
				grade: "C",
				hardBlockers: [
					{ id: "scope-declared", status: "FAIL" },
					{ id: "no-secrets-in-diff", status: "PASS" },
				],
				verdict: "CONTINUE",
			},
		}),
	);

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{
				blockers: {
					fired: 1,
					firedIds: ["scope-declared"],
					state: "available",
					total: 2,
				},
				stage: "discuss",
			},
			{ stage: "build" },
		],
	});
}

async function verifyCountsTheHardBlockersAStopRecordFromBefore(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writePreLetterStoppedRun();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{
				blockers: {
					fired: 1,
					firedIds: ["no-unrelated-refactors"],
					state: "available",
					total: 3,
				},
				stage: "build",
			},
		],
	});
}

async function verifyReportsTheFiredBlockersAsUnavailableForAStop(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRun();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{
				blockers: {
					reasons: [UNGRADED_BLOCKERS_REASON],
					state: "unavailable",
				},
				stage: "build",
			},
		],
	});
}

async function verifyHumanReview(
	_label: string,
	contents: string,
	expected: RunRecord["humanReview"],
): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();
	await Bun.write(
		benchmarkRunPaths(fixture.runsDirectory, fixture.stoppedRun).reviewFile,
		contents,
	);

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toMatchObject({ humanReview: expected });
}

async function verifyAbsentHumanReview(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toMatchObject({
		humanReview: {
			reasons: ["No human review recorded"],
			state: "unavailable",
		},
	});
}

function registerRunRecordJudgementsTheRunAndItsStages(): void {
	it(
		"reports a stage left awaiting its judge as awaiting judgment with no letter",
		verifyReportsAStageLeftAwaitingItsJudgeAsAwaiting,
	);

	it(
		"reports a graded stage's letter with its verdict",
		verifyReportsAGradedStageSLetterWithItsVerdict,
	);

	it(
		"counts and names the hard blockers a stage's judge found fired",
		verifyCountsAndNamesTheHardBlockersAStageS,
	);

	it(
		"counts the hard blockers a scorecard keeps in its grade",
		verifyCountsTheHardBlockersAScorecardKeepsInIts,
	);

	it(
		"counts the hard blockers a stop record from before the letter grade keeps",
		verifyCountsTheHardBlockersAStopRecordFromBefore,
	);

	it(
		"reports the fired blockers as unavailable for a stop record without the Judge's findings",
		verifyReportsTheFiredBlockersAsUnavailableForAStop,
	);
}
