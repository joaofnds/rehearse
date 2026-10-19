import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { readLaunchRecord } from "#benchmark/launch-record";
import {
	RUN as ANALYZED_RUN,
	runStoppedAtBuild,
	runWithOneGradedStage,
} from "#benchmark/root-cause-analysis-test-support";
import type { RunLiveness } from "#benchmark/run-liveness";
import { claimBy } from "#benchmark/run-records-test-support";
import { storeSpendCeiling } from "#benchmark/settings";
import { findCommand, parseCommandLine } from "#cli/commands";
import {
	LaunchFixture,
	launchedSchema,
	refusalSchema,
} from "#server/launch-http-test-fixture";

const launchFixture = new LaunchFixture();

const { harness } = launchFixture;

afterEach(async () => {
	await launchFixture.dispose();
});

const RUNNING_PID = 4242;

const stillRunning: RunLiveness = {
	isAlive: (pid) => pid === RUNNING_PID,
	readMarker: async () =>
		await Promise.resolve(claimBy(ANALYZED_RUN, RUNNING_PID)),
};

describe("POST /api/launches", () => {
	it(
		"starts it under sonnet, capped at the cost the dialog stated",
		verifyStartsItUnderSonnetCappedAtTheCostThe,
	);
	it(
		"starts a command line the CLI accepts",
		verifyStartsACommandLineTheCLIAccepts,
	);
	it(
		"caps it at a stored ceiling below the analysis budget",
		verifyCapsItAtAStoredCeilingBelowTheAnalysis,
	);
	it(
		"refuses when the most it can spend differs from what the dialog stated, before starting anything",
		verifyRefusesWhenTheMostItCanSpendDiffersFrom,
	);
	it(
		"refuses a stated cost below what it can now spend",
		verifyRefusesAStatedCostBelowWhatItCanNow,
	);
	it(
		"refuses a run still in flight, before starting anything",
		verifyRefusesARunStillInFlightBeforeStartingAnything,
	);
	it("refuses a run nothing recorded", verifyRefusesARunNothingRecorded);
	it(
		"refuses with no spend ceiling stored, before starting anything",
		verifyRefusesWithNoSpendCeilingStoredBeforeStartingAnything,
	);
});

async function verifyStartsItUnderSonnetCappedAtTheCostThe(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness();
	await runStoppedAtBuild(runsDirectory);

	const response = await post({
		kind: "analysis",
		run: ANALYZED_RUN,
		statedUsd: 1,
	});
	const { id } = launchedSchema.parse(await response.json());

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_ACCEPTED);
	expect(launcher.launches.map(({ argv }) => argv)).toEqual([
		["diagnose", ANALYZED_RUN, "--model", "sonnet", "--budget-usd", "1"],
	]);
	expect(await readLaunchRecord(runsDirectory, id)).toMatchObject({
		kind: "analysis",
		run: ANALYZED_RUN,
		usd: 1,
	});
}

async function verifyStartsACommandLineTheCLIAccepts(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness();
	await runStoppedAtBuild(runsDirectory);

	await post({ kind: "analysis", run: ANALYZED_RUN, statedUsd: 1 });
	const [launch] = launcher.launches;
	const { command, args } = findCommand(launch?.argv ?? []);

	expect(command.name).toBe("diagnose");
	expect(parseCommandLine(command, args).argument).toBe(ANALYZED_RUN);
}

async function verifyCapsItAtAStoredCeilingBelowTheAnalysis(): Promise<void> {
	const storedCeilingUsd = 0.5;

	const { launcher, post, runsDirectory } = await harness();
	await runStoppedAtBuild(runsDirectory);
	await storeSpendCeiling(runsDirectory, storedCeilingUsd);

	const response = await post({
		kind: "analysis",
		run: ANALYZED_RUN,
		statedUsd: 0.5,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_ACCEPTED);
	expect(launcher.launches.map(({ argv }) => argv)).toEqual([
		["diagnose", ANALYZED_RUN, "--model", "sonnet", "--budget-usd", "0.5"],
	]);
}

async function verifyRefusesWhenTheMostItCanSpendDiffersFrom(): Promise<void> {
	const storedCeilingUsd = 0.5;

	const { launcher, post, runsDirectory } = await harness();
	await runStoppedAtBuild(runsDirectory);
	await storeSpendCeiling(runsDirectory, storedCeilingUsd);

	const response = await post({
		kind: "analysis",
		run: ANALYZED_RUN,
		statedUsd: 1,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(refusalSchema.parse(await response.json()).error).toBe(
		"An analysis can now spend at most $0.50, not the $1.00 the dialog stated; reopen it to read the current cost",
	);
	expect(launcher.launches).toEqual([]);
}

async function verifyRefusesAStatedCostBelowWhatItCanNow(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness();
	await runStoppedAtBuild(runsDirectory);

	const response = await post({
		kind: "analysis",
		run: ANALYZED_RUN,
		statedUsd: 0.5,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(launcher.launches).toEqual([]);
}

async function verifyRefusesARunStillInFlightBeforeStartingAnything(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness(
		"stored",
		stillRunning,
	);
	await runWithOneGradedStage(runsDirectory);

	const response = await post({
		kind: "analysis",
		run: ANALYZED_RUN,
		statedUsd: 1,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(refusalSchema.parse(await response.json()).error).toBe(
		`Run ${ANALYZED_RUN} is still in flight, so it has no outcome to analyze`,
	);
	expect(launcher.launches).toEqual([]);
}

async function verifyRefusesARunNothingRecorded(): Promise<void> {
	const { launcher, post } = await harness();

	const response = await post({
		kind: "analysis",
		run: "../outside",
		statedUsd: 1,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
	expect(refusalSchema.parse(await response.json()).error).toBe(
		"No recorded run ../outside",
	);
	expect(launcher.launches).toEqual([]);
}

async function verifyRefusesWithNoSpendCeilingStoredBeforeStartingAnything(): Promise<void> {
	const { launcher, post, runsDirectory } = await harness("missing");
	await runStoppedAtBuild(runsDirectory);

	const response = await post({
		kind: "analysis",
		run: ANALYZED_RUN,
		statedUsd: 1,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(launcher.launches).toEqual([]);
}
