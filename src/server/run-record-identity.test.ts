import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { z } from "zod";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import { CASE_ID } from "#benchmark/run-records-test-support";
import { stoppedStatus } from "#benchmark/stopped-status";
import {
	GIT_SHA1_HEX_DIGITS,
	SHA256_HEX_DIGITS,
} from "#server/digest-test-support";
import {
	clearRunRecordRoots,
	emptyFixture,
	runRecord,
} from "#server/run-record-workspace-test-fixture";

import { MINIMUM_GRADE_REASON } from "./run-record";

afterEach(clearRunRecordRoots);

describe("run record identity", () => {
	describe(
		"the run and its stages",
		registerRunRecordIdentityTheRunAndItsStages,
	);

	describe("a run it cannot serve", registerRunRecordIdentityARunItCannotServe);
});

async function verifyNamesTheRunSShortIdAndCaseAnd(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();
	await fixture.claim(CASE_ID, [{ kind: "run", run: fixture.stoppedRun }]);

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		caseId: CASE_ID,
		shortId: { shortId: `${CASE_ID}/r1`, state: "available" },
		stages: [
			{
				checkpointShortId: {
					shortId: `${CASE_ID}/r1/s1`,
					state: "available",
				},
				stage: "discuss",
			},
			{ checkpointShortId: { state: "unavailable" }, stage: "build" },
		],
	});
}

async function verifyNamesTheRunSTargetByItsDirectoryName(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();
	const { manifestFile } = benchmarkRunPaths(
		fixture.runsDirectory,
		fixture.stoppedRun,
	);
	const recorded = z.looseObject({}).parse(await Bun.file(manifestFile).json());
	await Bun.write(
		manifestFile,
		JSON.stringify({ ...recorded, effort: "high" }),
	);

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		identity: {
			commit: "2".repeat(GIT_SHA1_HEX_DIGITS),
			effort: "high",
			model: "sonnet",
			target: "template",
		},
	});
}

async function verifyNamesAClonedRunSTargetByTheTarget(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();
	const { manifestFile } = benchmarkRunPaths(
		fixture.runsDirectory,
		fixture.stoppedRun,
	);
	const recorded = z.looseObject({}).parse(await Bun.file(manifestFile).json());
	await Bun.write(
		manifestFile,
		JSON.stringify({
			...recorded,
			sourceRoot: "/tmp/rehearse-target-a1b2c3/checkout",
			targetRoot: "/work/omelette-web",
		}),
	);

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		identity: { target: "omelette-web" },
	});
}

async function verifyNamesTheCorpusVersionTheRunRecordedWhenIt(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();
	const { manifestFile } = benchmarkRunPaths(
		fixture.runsDirectory,
		fixture.stoppedRun,
	);
	const recorded = z.looseObject({}).parse(await Bun.file(manifestFile).json());
	const corpusVersion = {
		digest: "a".repeat(SHA256_HEX_DIGITS),
		kind: "version",
	};
	await Bun.write(manifestFile, JSON.stringify({ ...recorded, corpusVersion }));

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		identity: { corpusVersion },
	});
}

async function verifyReportsTheShortIdAsUnavailableForARun(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		shortId: { state: "unavailable" },
		stages: [
			{ checkpointShortId: { state: "unavailable" }, stage: "discuss" },
			{ checkpointShortId: { state: "unavailable" }, stage: "build" },
		],
	});
}

async function verifyReportsTheRunSStatusAsRunHistoryReads(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunEvidence();

	const response = await runRecord(fixture, fixture.stoppedRun);

	expect(await response.json()).toMatchObject({
		minimumGrade: {
			reasons: [MINIMUM_GRADE_REASON],
			state: "unavailable",
		},
		status: { state: "available", status: stoppedStatus("build") },
	});
}

async function verifyAnswers404WithoutTheRunsDirectorySPathFor(): Promise<void> {
	const fixture = await emptyFixture();

	const response = await runRecord(fixture, "2026-01-01T00-00-00.000Z");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
	expect(await response.text()).not.toContain(fixture.runsDirectory);
}

async function verifyAnswers400ForARunNameThatLeavesThe(): Promise<void> {
	const fixture = await emptyFixture();

	const response = await runRecord(fixture, "../outside");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
	expect(await response.text()).not.toContain(fixture.runsDirectory);
}

function registerRunRecordIdentityTheRunAndItsStages(): void {
	it(
		"names the run's short id and case and each checkpointed stage's short id",
		verifyNamesTheRunSShortIdAndCaseAnd,
	);

	it(
		"names the run's target by its directory name, its commit, its model and its effort",
		verifyNamesTheRunSTargetByItsDirectoryName,
	);

	it(
		"names a cloned run's target by the target's directory, not its checkout's",
		verifyNamesAClonedRunSTargetByTheTarget,
	);

	it(
		"names the corpus version the run recorded when it started",
		verifyNamesTheCorpusVersionTheRunRecordedWhenIt,
	);

	it(
		"reports the short id as unavailable for a run no command claimed one for",
		verifyReportsTheShortIdAsUnavailableForARun,
	);

	it(
		"reports the run's status as run history reads it and its minimum grade as not recorded",
		verifyReportsTheRunSStatusAsRunHistoryReads,
	);
}

function registerRunRecordIdentityARunItCannotServe(): void {
	it(
		"answers 404 without the runs directory's path for a run it holds no record of",
		verifyAnswers404WithoutTheRunsDirectorySPathFor,
	);

	it(
		"answers 400 for a run name that leaves the runs directory",
		verifyAnswers400ForARunNameThatLeavesThe,
	);
}
