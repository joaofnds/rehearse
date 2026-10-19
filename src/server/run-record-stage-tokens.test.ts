import { afterEach, describe, expect, it } from "bun:test";

import {
	buildJudgeAttemptMetrics,
	buildJudgeHaltedMetrics,
	buildSessionMetrics,
	discussJudgeMetrics,
	discussSessionMetrics,
	sumCallMetric,
} from "#server/run-record-figures-test-fixture";
import {
	clearRunRecordRoots,
	emptyFixture,
	runRecord,
} from "#server/run-record-workspace-test-fixture";

afterEach(clearRunRecordRoots);

const discussCalls = [...discussSessionMetrics, discussJudgeMetrics];

describe("run record stage tokens", () => {
	it(
		"sums a stage's session and judge calls in four categories and as total input",
		verifySumsAStageSSessionAndJudgeCallsIn,
	);

	it(
		"names the judge as the part a stop record's sum lacks",
		verifyNamesTheJudgeAsThePartAStopRecord,
	);

	it(
		"sums a ceiling-stopped stage's session calls alone from its stop record",
		verifySumsACeilingStoppedStageSSessionCallsAlone,
	);

	it(
		"sums no tokens for a session the ceiling refused before its first call",
		verifySumsNoTokensForASessionTheCeilingRefused,
	);

	it(
		"sums every call a ceiling-halted Judge paid for",
		verifySumsEveryCallACeilingHaltedJudgePaidFor,
	);

	it(
		"names the Judge missing when its halted call reported no metrics",
		verifyNamesTheJudgeMissingWhenItsHaltedCallReported,
	);

	it(
		"sums no tokens for a Judge the ceiling refused before its first call",
		verifySumsNoTokensForAJudgeTheCeilingRefused,
	);
});

async function verifySumsAStageSSessionAndJudgeCallsIn(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{
				stage: "discuss",
				tokens: {
					cacheRead: sumCallMetric(discussCalls, "cacheReadTokens"),
					cacheWrite: sumCallMetric(discussCalls, "cacheWriteTokens"),
					input: sumCallMetric(discussCalls, "inputTokens"),
					missing: [],
					output: sumCallMetric(discussCalls, "outputTokens"),
					state: "available",
					totalInput:
						sumCallMetric(discussCalls, "inputTokens") +
						sumCallMetric(discussCalls, "cacheReadTokens") +
						sumCallMetric(discussCalls, "cacheWriteTokens"),
				},
			},
			{ stage: "build" },
		],
	});
}

async function verifyNamesTheJudgeAsThePartAStopRecord(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{
				stage: "build",
				tokens: {
					input: buildSessionMetrics.inputTokens,
					missing: [{ part: "build judge" }],
					output: buildSessionMetrics.outputTokens,
					state: "available",
				},
			},
		],
	});
}

async function verifySumsACeilingStoppedStageSSessionCallsAlone(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeSessionCeilingStoppedRun();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{
				stage: "build",
				tokens: {
					input: buildSessionMetrics.inputTokens,
					missing: [],
					output: buildSessionMetrics.outputTokens,
					state: "available",
				},
			},
		],
	});
}

async function verifySumsNoTokensForASessionTheCeilingRefused(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeSessionCeilingStoppedRun({
		costUsd: 0,
		providerCalls: [],
	});

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{
				stage: "build",
				tokens: { input: 0, missing: [], output: 0, state: "available" },
			},
		],
	});
}

async function verifySumsEveryCallACeilingHaltedJudgePaidFor(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeJudgeCeilingStoppedRun();

	const response = await runRecord(fixture, fixture.stoppedRun);

	const buildCalls = [
		buildSessionMetrics,
		buildJudgeAttemptMetrics,
		buildJudgeHaltedMetrics,
	];
	expect(await response.json()).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{
				stage: "build",
				tokens: {
					input: sumCallMetric(buildCalls, "inputTokens"),
					missing: [],
					output: sumCallMetric(buildCalls, "outputTokens"),
					state: "available",
				},
			},
		],
	});
}

async function verifyNamesTheJudgeMissingWhenItsHaltedCallReported(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeJudgeCeilingStoppedRun([
		{ metrics: buildJudgeAttemptMetrics },
		{},
	]);

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{
				stage: "build",
				tokens: {
					input: buildSessionMetrics.inputTokens,
					missing: [
						{
							part: "build judge",
							reason: "a call in the record has no metrics",
						},
					],
					state: "available",
				},
			},
		],
	});
}

async function verifySumsNoTokensForAJudgeTheCeilingRefused(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeJudgeCeilingStoppedRun([], []);

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{
				stage: "build",
				tokens: {
					input: buildSessionMetrics.inputTokens,
					missing: [],
					state: "available",
				},
			},
		],
	});
}
