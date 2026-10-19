import { afterEach, describe, expect, it } from "bun:test";

import { ASKED_RUN, FINISHED_RUN } from "#server/run-ending-test-fixture";
import {
	buildSessionMetrics,
	discussJudgeMetrics,
	discussSessionMetrics,
	productOwnerMetrics,
	runTokensSchema,
	sumCallMetric,
} from "#server/run-record-figures-test-fixture";
import {
	clearRunRecordRoots,
	emptyFixture,
	runRecord,
} from "#server/run-record-workspace-test-fixture";

afterEach(clearRunRecordRoots);

const discussCalls = [...discussSessionMetrics, discussJudgeMetrics];

describe("run record token coverage", () => {
	describe("tokens", registerRunRecordTokenCoverageTokens);

	describe(
		"figures the records do not hold",
		registerRunRecordTokenCoverageFiguresTheRecordsDoNotHold,
	);

	describe(
		"figures a newer run records",
		registerRunRecordTokenCoverageFiguresANewerRunRecords,
	);
});

async function verifyNamesTheProductOwnerAndTheStopRecordS(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		totals: {
			tokens: {
				missing: [{ part: "build judge" }, { part: "Product Owner" }],
				output: sumCallMetric(
					[...discussCalls, buildSessionMetrics],
					"outputTokens",
				),
				state: "available",
			},
		},
	});
}

async function verifyReportsTokensAsUnavailableForAStageWhoseRecord(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeAwaitingJudgeRun();

	const response = await runRecord(fixture, fixture.awaitingJudgeRun);

	expect(await response.json()).toMatchObject({
		stages: [
			{ stage: "discuss" },
			{ stage: "build", tokens: { state: "unavailable" } },
		],
	});
}

async function verifyNamesTheProductOwnerAndTheFinalJudgeAs(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.pipeline.writeFinishedRunEvidence(FINISHED_RUN);

	const response = await runRecord(fixture, FINISHED_RUN);

	expect(await response.json()).toMatchObject({
		totals: {
			tokens: {
				missing: [{ part: "Product Owner" }, { part: "final judge" }],
				state: "available",
			},
		},
	});
}

async function verifyAddsTheProductOwnerSCallsToAFinished(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.pipeline.writeFinishedRunWithReadings(
		FINISHED_RUN,
		"never asked",
	);
	await fixture.pipeline.writeFinishedRunWithReadings(ASKED_RUN, "asked");
	const neverAskedResponse = await runRecord(fixture, FINISHED_RUN);
	const askedResponse = await runRecord(fixture, ASKED_RUN);

	const neverAsked = runTokensSchema.parse(await neverAskedResponse.json());
	const asked: unknown = await askedResponse.json();

	const { tokens } = neverAsked.totals;
	expect(tokens.missing.map(({ part }) => part)).toEqual(["final judge"]);
	expect(asked).toMatchObject({
		totals: {
			tokens: {
				cacheRead: tokens.cacheRead + productOwnerMetrics.cacheReadTokens,
				cacheWrite: tokens.cacheWrite + productOwnerMetrics.cacheWriteTokens,
				input: tokens.input + productOwnerMetrics.inputTokens,
				missing: [{ part: "final judge" }],
				output: tokens.output + productOwnerMetrics.outputTokens,
				state: "available",
			},
		},
	});
}

function registerRunRecordTokenCoverageTokens(): void {
	it(
		"names the Product Owner and the stop record's judge as the parts the run's sum lacks",
		verifyNamesTheProductOwnerAndTheStopRecordS,
	);

	it.each([
		["holds no calls", []],
		["holds a call without metrics", [{ metrics: buildSessionMetrics }, {}]],
	])(
		"names a session whose record %s as a part the run's sum lacks",
		async (_record, buildSessionCalls) => {
			const fixture = await emptyFixture();
			await fixture.stopped.writeStoppedRunEvidence(buildSessionCalls);

			const response = await runRecord(fixture, fixture.stoppedRun);

			expect(await response.json()).toMatchObject({
				totals: {
					tokens: {
						missing: [
							{ part: "build session" },
							{ part: "build judge" },
							{ part: "Product Owner" },
						],
						state: "available",
					},
				},
			});
		},
	);

	it(
		"reports tokens as unavailable for a stage whose record holds no call metrics",
		verifyReportsTokensAsUnavailableForAStageWhoseRecord,
	);
}

function registerRunRecordTokenCoverageFiguresTheRecordsDoNotHold(): void {
	it(
		"names the Product Owner and the final judge as the parts a finished run's token sum lacks",
		verifyNamesTheProductOwnerAndTheFinalJudgeAs,
	);
}

function registerRunRecordTokenCoverageFiguresANewerRunRecords(): void {
	it(
		"adds the Product Owner's calls to a finished run's tokens, and misses none when it was never asked",
		verifyAddsTheProductOwnerSCallsToAFinished,
	);
}
