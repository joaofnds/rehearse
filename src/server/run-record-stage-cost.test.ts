import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { STOPPED_RUN_EVIDENCE } from "#benchmark/run-records-test-support";
import {
	clearRunRecordRoots,
	emptyFixture,
	runRecord,
} from "#server/run-record-workspace-test-fixture";

import { CALL_WITHOUT_METRICS_REASON } from "./run-record";

const INCOMPLETE_JUDGE_CALLS = [
	[
		"a halted call",
		[{ metrics: STOPPED_RUN_EVIDENCE.buildJudgeAttemptMetrics }, {}],
		undefined,
	],
	["an attempt", null, [{ costUsd: 0, outcome: "REJECTED", payload: null }]],
] as const;

afterEach(clearRunRecordRoots);

describe("run record stage cost", () => {
	it(
		"reports each stage's session and judge cost as its stage file records them",
		verifyReportsEachStageSSessionAndJudgeCostAs,
	);

	describe(
		"a cost a call without metrics leaves unknown",
		registerRunRecordStageCostACostACallWithoutMetricsLeavesUnknown,
	);
});

async function verifyReportsEachStageSSessionAndJudgeCostAs(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toMatchObject({
		stages: [
			{
				judgeCost: { state: "available", usd: 1 },
				sessionCost: { state: "available", usd: 2 },
				stage: "discuss",
			},
			{
				judgeCost: { state: "available", usd: 0.5 },
				sessionCost: { state: "available", usd: 3 },
				stage: "build",
			},
		],
	});
}

async function verifyReadsACeilingHaltedJudgeSCostWhenEvery(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeJudgeCeilingStoppedRun();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{ judgeCost: { state: "available", usd: 1 }, stage: "build" },
		],
	});
}

async function verifyReadsASessionSCostWhenOnlyAnEarlier(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeSessionCeilingStoppedRun({
		costUsd: 3,
		providerCalls: [{}, { metrics: STOPPED_RUN_EVIDENCE.buildSessionMetrics }],
	});

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{ sessionCost: { state: "available", usd: 3 }, stage: "build" },
		],
	});
}

async function verifyNamesASessionSCostUnknownWhenItsLast(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeSessionCeilingStoppedRun({
		costUsd: 3,
		providerCalls: [{ metrics: STOPPED_RUN_EVIDENCE.buildSessionMetrics }, {}],
	});

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{
				sessionCost: {
					reasons: [CALL_WITHOUT_METRICS_REASON],
					state: "unavailable",
				},
				stage: "build",
			},
		],
	});
}

function registerRunRecordStageCostACostACallWithoutMetricsLeavesUnknown(): void {
	it(
		"reads a ceiling-halted Judge's cost when every call it paid for has metrics",
		verifyReadsACeilingHaltedJudgeSCostWhenEvery,
	);

	it.each(INCOMPLETE_JUDGE_CALLS)(
		"names a stage Judge's cost unknown when %s has no metrics",
		async (_call, judgeProviderCalls, attempts) => {
			const fixture = await emptyFixture();
			await fixture.stopped.writeJudgeCeilingStoppedRun(
				judgeProviderCalls,
				attempts,
			);

			const response = await runRecord(fixture, fixture.stoppedRun);

			expect(await response.json()).toMatchObject({
				stages: [
					{ stage: "discuss" },
					{
						judgeCost: {
							reasons: [CALL_WITHOUT_METRICS_REASON],
							state: "unavailable",
						},
						stage: "build",
					},
				],
			});
		},
	);

	it(
		"reads a session's cost when only an earlier call has no metrics",
		verifyReadsASessionSCostWhenOnlyAnEarlier,
	);

	it(
		"names a session's cost unknown when its last call has no metrics",
		verifyNamesASessionSCostUnknownWhenItsLast,
	);
}
