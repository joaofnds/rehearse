import { describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";

import { RefusedPreconditionError } from "./exit-codes";
import { analyzeRun } from "./root-cause-analysis";
import {
	ANSWER,
	FakeAnalysisProvider,
	answering,
} from "./root-cause-analysis-provider-test-fixtures";
import {
	FIRST_RECORDED_STAGE_INDEX,
	dependencies,
	laterRunHolds,
	registerAnalysisFixtureCleanup,
	runsDirectory,
	stillRunning,
	unnamedClaim,
} from "./root-cause-analysis-test-environment";
import {
	RUN,
	runStoppedAtBuild,
	runWithOneGradedStage,
} from "./root-cause-analysis-test-support";
import { benchmarkRunPaths } from "./run-layout";
import { recordPaused } from "./run-pause";

registerAnalysisFixtureCleanup();

async function analyzesARunWhoseProcessDiedBeforeItHadAnOutcome(): Promise<void> {
	const directory = await runsDirectory();
	await runWithOneGradedStage(directory);
	const provider = new FakeAnalysisProvider();
	provider.answer(
		answering({
			...ANSWER,
			rootCause: null,
			stages: [ANSWER.stages[FIRST_RECORDED_STAGE_INDEX]],
		}),
	);

	const { record } = await analyzeRun(
		{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
		dependencies(provider.invoke),
	);

	const [observedFirstStage] = ANSWER.stages;

	expect(record).toMatchObject({
		outcome: "recorded",
		rootCause: null,
		stages: [
			observedFirstStage,
			{ role: "never ran", stage: "build" },
			{ role: "never ran", stage: "review" },
		],
	});
}

async function analyzesADeadRunWhoseTargetALaterRunNowHolds(): Promise<void> {
	const directory = await runsDirectory();
	await runWithOneGradedStage(directory);
	const provider = new FakeAnalysisProvider();
	provider.answer(
		answering({
			...ANSWER,
			rootCause: null,
			stages: [ANSWER.stages[FIRST_RECORDED_STAGE_INDEX]],
		}),
	);

	const { record } = await analyzeRun(
		{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
		{ ...dependencies(provider.invoke), liveness: laterRunHolds() },
	);

	expect(record).toMatchObject({ outcome: "recorded" });
}

async function refusesARunWithNoRecordsBeforeAnyCall(): Promise<void> {
	const directory = await runsDirectory();
	const provider = new FakeAnalysisProvider();

	const failure = await failureOf(
		analyzeRun(
			{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
			dependencies(provider.invoke),
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toBe(`No run ${RUN} is recorded`);
	expect(provider.budgets).toEqual([]);
}

async function refusesARunStillInFlightBeforeAnyCall(): Promise<void> {
	const directory = await runsDirectory();
	await runWithOneGradedStage(directory);
	const provider = new FakeAnalysisProvider();

	const failure = await failureOf(
		analyzeRun(
			{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
			{ ...dependencies(provider.invoke), liveness: stillRunning },
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toBe(
		`Run ${RUN} is still in flight, so it has no outcome to analyze`,
	);
	expect(provider.budgets).toEqual([]);
}

async function refusesARunThatHasRecordedNoEventWhileAnOlderCheckoutSClaimOnItsTargetIsLive(): Promise<void> {
	const directory = await runsDirectory();
	await runWithOneGradedStage(directory);
	const provider = new FakeAnalysisProvider();

	const failure = await failureOf(
		analyzeRun(
			{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
			{ ...dependencies(provider.invoke), liveness: unnamedClaim() },
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(provider.budgets).toEqual([]);
}

async function refusesAPausedRunBeforeAnyCall(): Promise<void> {
	const directory = await runsDirectory();
	await runWithOneGradedStage(directory);
	await recordPaused(
		benchmarkRunPaths(directory, RUN),
		"shape",
		"2026-10-04T11:00:00.000Z",
	);
	const provider = new FakeAnalysisProvider();

	const failure = await failureOf(
		analyzeRun(
			{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
			dependencies(provider.invoke),
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toBe(
		`Run ${RUN} ended paused before its final judge, so it has no outcome to analyze`,
	);
	expect(provider.budgets).toEqual([]);
}

async function refusesWhenNoSpendCeilingIsStoredBeforeAnyCall(): Promise<void> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory);
	const provider = new FakeAnalysisProvider();

	const failure = await failureOf(
		analyzeRun(
			{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
			{
				...dependencies(provider.invoke),
				requireSpendCeiling: async () =>
					await Promise.reject(new RefusedPreconditionError("no ceiling")),
			},
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toBe("no ceiling");
	expect(provider.budgets).toEqual([]);
}
describe(analyzeRun.name, () => {
	it(
		"analyzes a run whose process died before it had an outcome",
		analyzesARunWhoseProcessDiedBeforeItHadAnOutcome,
	);
	it(
		"analyzes a dead run whose target a later run now holds",
		analyzesADeadRunWhoseTargetALaterRunNowHolds,
	);
	describe("when the run cannot be analyzed", () => {
		it(
			"refuses a run with no records before any call",
			refusesARunWithNoRecordsBeforeAnyCall,
		);
		it(
			"refuses a run still in flight before any call",
			refusesARunStillInFlightBeforeAnyCall,
		);
		it(
			"refuses a run that has recorded no event while an older checkout's claim on its target is live",
			refusesARunThatHasRecordedNoEventWhileAnOlderCheckoutSClaimOnItsTargetIsLive,
		);
		it("refuses a paused run before any call", refusesAPausedRunBeforeAnyCall);
		it(
			"refuses when no spend ceiling is stored before any call",
			refusesWhenNoSpendCeilingIsStoredBeforeAnyCall,
		);
	});
});
