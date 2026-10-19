import { afterEach, describe, expect, it } from "bun:test";

import {
	clearRunRecordRoots,
	emptyFixture,
	runRecord,
} from "#server/run-record-workspace-test-fixture";

import {
	PRODUCT_OWNER_COST_REASON,
	PRODUCT_OWNER_TOKENS_REASON,
	RUN_WALL_TIME_REASON,
	UNRECORDED_STAGE_REASON,
	WALL_TIME_REASON,
} from "./run-record";

afterEach(clearRunRecordRoots);

describe("run record missing figures", () => {
	it(
		"reports wall time as not recorded for each stage and for the run",
		verifyReportsWallTimeAsNotRecordedForEachStage,
	);

	it(
		"reports the Product Owner's spend as not recorded on a run without a main artifact",
		verifyReportsTheProductOwnerSSpendAsNotRecorded,
	);

	it(
		"sums the run cost from the parts it names and names the part it lacks",
		verifySumsTheRunCostFromThePartsItNames,
	);

	it(
		"names the session of the stage a run ended in without a record as a part the run's sums lack",
		verifyNamesTheSessionOfTheStageARunEnded,
	);
});

async function verifyReportsWallTimeAsNotRecordedForEachStage(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		/**
		 * Each expectation is its own object: Bun 1.4.0's toMatchObject
		 * passes a mismatch where one expected object is reused.
		 */
		stages: [
			{
				stage: "discuss",
				wallTime: { reasons: [WALL_TIME_REASON], state: "unavailable" },
			},
			{
				stage: "build",
				wallTime: { reasons: [WALL_TIME_REASON], state: "unavailable" },
			},
		],
		totals: {
			wallTime: { reasons: [RUN_WALL_TIME_REASON], state: "unavailable" },
		},
	});
}

async function verifyReportsTheProductOwnerSSpendAsNotRecorded(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		totals: {
			productOwnerCost: {
				reasons: [PRODUCT_OWNER_COST_REASON],
				state: "unavailable",
			},
		},
	});
}

async function verifySumsTheRunCostFromThePartsItNames(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		totals: {
			cost: {
				missing: [{ part: "Product Owner", reason: PRODUCT_OWNER_COST_REASON }],
				parts: [
					{ part: "discuss session", usd: 2 },
					{ part: "discuss judge", usd: 1 },
					{ part: "build session", usd: 3 },
					{ part: "build judge", usd: 0.5 },
				],
				state: "available",
				usd: 6.5,
			},
		},
	});
}

async function verifyNamesTheSessionOfTheStageARunEnded(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.events.writeInterruptedRun();

	const response = await runRecord(fixture, fixture.interruptedRun);

	expect(await response.json()).toMatchObject({
		totals: {
			cost: {
				reasons: [
					`build session: ${UNRECORDED_STAGE_REASON}`,
					`Product Owner: ${PRODUCT_OWNER_COST_REASON}`,
				],
				state: "unavailable",
			},
			tokens: {
				reasons: [
					`build session: ${UNRECORDED_STAGE_REASON}`,
					`Product Owner: ${PRODUCT_OWNER_TOKENS_REASON}`,
				],
				state: "unavailable",
			},
		},
	});
}
