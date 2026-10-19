import { afterEach, describe, expect, it } from "bun:test";

import { RECORDED_READINGS } from "#benchmark/run-records-test-support";
import {
	clearFigureRoots,
	emptyFixture,
	runRow,
} from "#server/history-figures-workspace-test-fixture";

import { PRODUCT_OWNER_COST_REASON, RUN_WALL_TIME_REASON } from "./run-record";

afterEach(clearFigureRoots);

describe("/api/runs", () => {
	describe("GET", () => {
		describe("a pipeline run row", () => {
			it(
				"carries the run's cost summed over the parts it names, naming the part it lacks",
				verifyCarriesTheRunSCostSummedOverTheParts,
			);

			it(
				"counts a ceiling-stopped stage's session spend from its stop record",
				verifyCountsACeilingStoppedStageSSessionSpendFrom,
			);

			it(
				"names no judge part for a stage the ceiling stopped before its Judge ran",
				verifyNamesNoJudgePartForAStageTheCeiling,
			);

			it(
				"names only the session for a ceiling stop written before stop records held its spend",
				verifyNamesOnlyTheSessionForACeilingStopWritten,
			);

			it(
				"carries the run's wall time as not recorded with its reason",
				verifyCarriesTheRunSWallTimeAsNotRecorded,
			);

			it(
				"carries a stopped run's wall time from its stop record",
				verifyCarriesAStoppedRunSWallTimeFromIts,
			);
		});
	});
});

async function verifyCarriesTheRunSCostSummedOverTheParts(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();

	const row = await runRow(fixture, fixture.stoppedRun);

	expect(row).toMatchObject({
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
	});
}

async function verifyCountsACeilingStoppedStageSSessionSpendFrom(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeSessionCeilingStoppedRun();

	const row = await runRow(fixture, fixture.stoppedRun);

	expect(row).toMatchObject({
		cost: {
			parts: [
				{ part: "discuss session", usd: 2 },
				{ part: "discuss judge", usd: 1 },
				{ part: "build session", usd: 3 },
				{ part: "Product Owner", usd: 0.25 },
			],
			state: "available",
			usd: 6.25,
		},
	});
}

async function verifyNamesNoJudgePartForAStageTheCeiling(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeSessionCeilingStoppedRun();

	const row = await runRow(fixture, fixture.stoppedRun);

	expect(row).toMatchObject({ cost: { missing: [] } });
}

async function verifyNamesOnlyTheSessionForACeilingStopWritten(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeSessionCeilingStoppedRun(null);

	const row = await runRow(fixture, fixture.stoppedRun);

	expect(row).toMatchObject({
		cost: { missing: [{ part: "build session" }] },
	});
}

async function verifyCarriesTheRunSWallTimeAsNotRecorded(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();

	const row = await runRow(fixture, fixture.stoppedRun);

	expect(row).toMatchObject({
		wallTime: { reasons: [RUN_WALL_TIME_REASON], state: "unavailable" },
	});
}

async function verifyCarriesAStoppedRunSWallTimeFromIts(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunWithReadings();

	const row = await runRow(fixture, fixture.stoppedRun);

	expect(row).toMatchObject({
		wallTime: {
			ms: RECORDED_READINGS.runElapsedMs,
			state: "available",
		},
	});
}
