import { afterEach, describe, expect, it } from "bun:test";

import { z } from "zod";

import { PASS } from "#benchmark/comparison-test-fixtures";
import {
	clearFigureRoots,
	emptyFixture,
	onlyRowOfKind,
} from "#server/history-figures-workspace-test-fixture";

import {
	NO_GRADED_REP_REASON,
	UNRECORDED_REP_REASON,
} from "./confirmation-group-summary";
import SESSION_GRADE_REASON from "./session-grade-reason";

afterEach(clearFigureRoots);

const SINGLE_SESSION_REP_COUNT = 1;

/** A group row's counts, read whole so a test can pin every name counted. */
const stageCountsSchema = z.looseObject({
	ungraded: z.record(z.string(), z.number()),
});

const groupCountsSchema = z.looseObject({
	finalOutcomes: z.record(z.string(), z.number()),
	stageSummaries: z.array(stageCountsSchema),
});

const unreadRepSchema = z.object({ reason: z.string(), repId: z.string() });

const unreadRepsSchema = z.looseObject({
	unreadReps: z.array(unreadRepSchema),
});

describe("/api/runs", () => {
	describe("GET", () => {
		describe("a confirmation group row", () => {
			it(
				"summarizes each stage by its lower middle grade, its range and its graded count",
				verifySummarizesEachStageByItsLowerMiddleGradeIts,
			);

			it(
				"summarizes an odd count of grades by its middle grade",
				verifySummarizesAnOddCountOfGradesByItsMiddle,
			);

			it(
				"counts each rep a stage did not grade under its recorded status and names each rep that recorded nothing",
				verifyCountsEachRepAStageDidNotGradeUnder,
			);

			it(
				"keeps its row when a rep record does not parse, naming that rep and why",
				verifyKeepsItsRowWhenARepRecordDoesNot,
			);

			it(
				"tallies its reps' final outcomes by verdict or status and counts the successful reps",
				verifyTalliesItsRepsFinalOutcomesByVerdictOrStatus,
			);

			it(
				"carries a session group's successful reps of those requested and no grade letter",
				verifyCarriesASessionGroupSSuccessfulRepsOfThose,
			);
		});
	});
});

async function verifySummarizesEachStageByItsLowerMiddleGradeIts(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.confirmations.records.writePipelineGroup(
		"pipeline-group",
		(["C", "A", "D", "B"] as const).map((build) => ({
			build,
			discussion: "A",
			final: "pass",
		})),
	);

	const row = await onlyRowOfKind(fixture, "group");

	expect(row).toMatchObject({
		stageSummaries: [
			{
				graded: 4,
				grades: {
					highest: "A",
					lowest: "A",
					median: "A",
					state: "available",
				},
				stage: "discuss",
			},
			{
				graded: 4,
				grades: {
					highest: "A",
					lowest: "D",
					median: "C",
					state: "available",
				},
				stage: "build",
			},
		],
	});
}

async function verifySummarizesAnOddCountOfGradesByItsMiddle(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.confirmations.records.writePipelineGroup(
		"pipeline-group",
		(["B", "D", "A"] as const).map((build) => ({
			build,
			discussion: "A",
			final: "pass",
		})),
	);

	const row = await onlyRowOfKind(fixture, "group");

	expect(row).toMatchObject({
		stageSummaries: [
			{ stage: "discuss" },
			{
				graded: 3,
				grades: {
					highest: "A",
					lowest: "D",
					median: "B",
					state: "available",
				},
				stage: "build",
			},
		],
	});
}

async function verifyCountsEachRepAStageDidNotGradeUnder(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.confirmations.records.writePipelineGroup("pipeline-group", [
		{ build: "error", discussion: "A", final: "not-reached" },
		{ build: "not-reached", discussion: "A", final: "not-reached" },
		undefined,
	]);

	const row = await onlyRowOfKind(fixture, "group");

	expect(
		groupCountsSchema.parse(row).stageSummaries.map(({ ungraded }) => ungraded),
	).toEqual([{}, { EXECUTION_FAILED: 1, NOT_REACHED: 1 }]);
	expect(row).toMatchObject({
		stageSummaries: [
			{ graded: 2, stage: "discuss" },
			{
				graded: 0,
				grades: { reasons: [NO_GRADED_REP_REASON], state: "unavailable" },
				stage: "build",
			},
		],
		unreadReps: [
			{ reason: UNRECORDED_REP_REASON, repId: "pipeline-group-rep-3" },
		],
	});
}

async function verifyKeepsItsRowWhenARepRecordDoesNot(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.confirmations.records.writePipelineGroup("pipeline-group", [
		PASS,
		PASS,
	]);
	await Bun.write(
		fixture.confirmations.records.repRecordFile({
			groupId: "pipeline-group",
			repId: "pipeline-group-rep-2",
		}),
		"{ not json",
	);

	const row = await onlyRowOfKind(fixture, "group");

	expect(row).toMatchObject({
		cost: {
			missing: [{ part: "pipeline-group-rep-2" }],
			state: "available",
			usd: 1,
		},
		stageSummaries: [
			{ graded: 1, stage: "discuss" },
			{ graded: 1, stage: "build" },
		],
		unreadReps: [{ repId: "pipeline-group-rep-2" }],
	});
	const [unread] = unreadRepsSchema.parse(row).unreadReps;
	expect(unread?.reason).toContain("JSON Parse error");
}

async function verifyTalliesItsRepsFinalOutcomesByVerdictOrStatus(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.confirmations.records.writePipelineGroup("pipeline-group", [
		{ build: "pass", discussion: "pass", final: "pass" },
		{ build: "pass", discussion: "pass", final: "fail" },
		{ build: "error", discussion: "pass", final: "error" },
		{ build: "not-reached", discussion: "fail", final: "not-reached" },
	]);

	const row = await onlyRowOfKind(fixture, "group");

	expect(groupCountsSchema.parse(row).finalOutcomes).toEqual({
		EXECUTION_FAILED: 1,
		FAIL: 1,
		NOT_REACHED: 1,
		PASS: 1,
	});
	expect(row).toMatchObject({ successful: 1 });
}

async function verifyCarriesASessionGroupSSuccessfulRepsOfThose(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.confirmations.records.writeSessionGroup(
		"session-group",
		SINGLE_SESSION_REP_COUNT,
	);

	const row = await onlyRowOfKind(fixture, "group");

	expect(row).toMatchObject({
		mode: "session",
		reps: 2,
		stageSummaries: [
			{
				graded: 0,
				grades: { reasons: [SESSION_GRADE_REASON], state: "unavailable" },
				stage: "checks",
				ungraded: { NOT_REACHED: 1 },
			},
		],
		successful: 0,
		unreadReps: [
			{ reason: UNRECORDED_REP_REASON, repId: "session-group-rep-2" },
		],
	});
}
