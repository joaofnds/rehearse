import { afterEach, describe, expect, it } from "bun:test";

import { STOPPED_RUN_EVIDENCE } from "#benchmark/run-records-test-support";
import { FINISHED_RUN } from "#server/run-ending-test-fixture";
import {
	runCostSchema,
	runTokensSchema,
} from "#server/run-record-figures-test-fixture";
import {
	clearRunRecordRoots,
	emptyFixture,
	runRecord,
} from "#server/run-record-workspace-test-fixture";

import { CALL_WITHOUT_METRICS_REASON } from "./run-record";

afterEach(clearRunRecordRoots);

describe("run record final cost", () => {
	describe(
		"a cost a call without metrics leaves unknown",
		registerRunRecordFinalCostACostACallWithoutMetricsLeavesUnknown,
	);

	describe(
		"figures the records do not hold",
		registerRunRecordFinalCostFiguresTheRecordsDoNotHold,
	);

	describe("the final outcome", registerRunRecordFinalCostTheFinalOutcome);
});

async function verifySumsAFailedFinalJudgeSCostWhenEvery(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.pipeline.writeFinalJudgeFailedRun(FINISHED_RUN, [
		{ metrics: STOPPED_RUN_EVIDENCE.buildJudgeHaltedMetrics },
	]);

	const response = await runRecord(fixture, FINISHED_RUN);

	const { parts } = runCostSchema.parse(await response.json()).totals.cost;
	expect(parts).toContainEqual({ part: "final judge", usd: 1.5 });
}

async function verifyNamesTheFinalJudgeSCostMissingWhenA(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.pipeline.writeFinalJudgeFailedRun(FINISHED_RUN, [{}]);

	const response = await runRecord(fixture, FINISHED_RUN);

	expect(await response.json()).toMatchObject({
		totals: {
			cost: {
				missing: [{ part: "final judge", reason: CALL_WITHOUT_METRICS_REASON }],
			},
		},
	});
}

async function verifySumsAFinishedRunSCostOverItsStages(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.pipeline.writeFinishedRunEvidence(FINISHED_RUN);

	const response = await runRecord(fixture, FINISHED_RUN);

	expect(await response.json()).toMatchObject({
		totals: {
			cost: {
				missing: [],
				parts: [
					{ part: "discuss session", usd: 2 },
					{ part: "discuss judge", usd: 1 },
					{ part: "build session", usd: 2 },
					{ part: "build judge", usd: 1 },
					{ part: "Product Owner", usd: 0.25 },
					{ part: "final judge", usd: 1.5 },
				],
				state: "available",
				usd: 7.75,
			},
			productOwnerCost: { state: "available", usd: 0.25 },
		},
	});
}

async function verifySumsEveryCallAFailedFinalJudgePaidFor(): Promise<void> {
	const fixture = await emptyFixture();
	const halted = STOPPED_RUN_EVIDENCE.buildJudgeHaltedMetrics;
	await fixture.pipeline.writeFinalJudgeFailedRun(FINISHED_RUN, [
		{ metrics: halted },
	]);

	const response = await runRecord(fixture, FINISHED_RUN);

	const { tokens } = runTokensSchema.parse(await response.json()).totals;
	expect(tokens).toMatchObject({
		input: halted.inputTokens,
		output: halted.outputTokens,
	});
	expect(tokens.missing.map(({ part }) => part)).not.toContain("final judge");
}

function registerRunRecordFinalCostACostACallWithoutMetricsLeavesUnknown(): void {
	it(
		"sums a failed final judge's cost when every call it paid for has metrics",
		verifySumsAFailedFinalJudgeSCostWhenEvery,
	);

	it(
		"names the final judge's cost missing when a call it paid for has no metrics",
		verifyNamesTheFinalJudgeSCostMissingWhenA,
	);
}

function registerRunRecordFinalCostFiguresTheRecordsDoNotHold(): void {
	it(
		"sums a finished run's cost over its stages, Product Owner and final judge",
		verifySumsAFinishedRunSCostOverItsStages,
	);
}

function registerRunRecordFinalCostTheFinalOutcome(): void {
	it(
		"sums every call a failed final judge paid for",
		verifySumsEveryCallAFailedFinalJudgePaidFor,
	);
}
