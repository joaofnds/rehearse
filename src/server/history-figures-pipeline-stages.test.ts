import { afterEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import {
	clearFigureRoots,
	emptyFixture,
	liveRun,
	reconciledAsInterrupted,
	runRow,
} from "#server/history-figures-workspace-test-fixture";

import { NO_MANIFEST_REASON } from "./run-history";
import { STOPPED_GRADE_REASON, UNREACHED_STAGE_REASON } from "./run-record";

afterEach(clearFigureRoots);

describe("/api/runs", () => {
	describe("GET", () => {
		describe("a pipeline run row", () => {
			it(
				"carries one stage grade per stage in pipeline order, marking a stopped stage's grade as not recorded",
				verifyCarriesOneStageGradePerStageInPipelineOrder,
			);

			it(
				"marks each stage after the one a live run is in as not run",
				verifyMarksEachStageAfterTheOneALiveRun,
			);

			it(
				"keeps its figures when its case's short id registry cannot be read",
				verifyKeepsItsFiguresWhenItsCaseSShortId,
			);

			it(
				"marks each stage after the one an interrupted run ended in as not run",
				verifyMarksEachStageAfterTheOneAnInterruptedRun,
			);

			it(
				"keeps a stage before the one an interrupted run ended in as no-record",
				verifyKeepsAStageBeforeTheOneAnInterruptedRun,
			);

			it(
				"keeps a stage that saved a checkpoint without a record as no-record",
				verifyKeepsAStageThatSavedACheckpointWithoutA,
			);

			describe(
				"when the run wrote no manifest",
				registerHistoryFiguresPipelineStagesWhenTheRunWroteNoManifest,
			);

			describe(
				"when a stage record does not parse",
				registerHistoryFiguresPipelineStagesWhenAStageRecordDoesNotParse,
			);
		});
	});
});

async function verifyCarriesOneStageGradePerStageInPipelineOrder(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRun();

	const row = await runRow(fixture, fixture.stoppedRun);

	expect(row).toMatchObject({
		stageGrades: {
			grades: [
				{
					grade: { letter: "A", state: "available" },
					stage: "discuss",
					status: "graded",
				},
				{
					grade: {
						reasons: [STOPPED_GRADE_REASON],
						state: "unavailable",
					},
					stage: "build",
					status: "stopped",
				},
			],
			state: "available",
		},
	});
}

async function verifyMarksEachStageAfterTheOneALiveRun(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.events.writeRunningRun("turn-completed", "discuss");

	const row = await runRow(fixture, fixture.runningRun, liveRun);

	expect(row).toMatchObject({
		stageGrades: {
			grades: [
				{ stage: "discuss", status: "no-record" },
				{
					grade: {
						reasons: [UNREACHED_STAGE_REASON],
						state: "unavailable",
					},
					stage: "build",
					status: "not-run",
				},
			],
			state: "available",
		},
	});
}

async function verifyKeepsItsFiguresWhenItsCaseSShortId(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRun();
	await mkdir(
		join(fixture.runsDirectory, "short-ids", "audit-log", "claims", "99"),
		{ recursive: true },
	);

	const row = await runRow(fixture, fixture.stoppedRun);

	expect(row).toMatchObject({
		finalOutcome: { state: "available", status: "NOT_REACHED" },
		stageGrades: { state: "available" },
	});
}

async function verifyMarksEachStageAfterTheOneAnInterruptedRun(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.events.writeRunningRun("turn-completed", "discuss");
	await reconciledAsInterrupted(fixture, fixture.runningRun, "discuss");

	const row = await runRow(fixture, fixture.runningRun);

	expect(row).toMatchObject({
		stageGrades: {
			grades: [
				{ stage: "discuss", status: "no-record" },
				{ stage: "build", status: "not-run" },
			],
			state: "available",
		},
	});
}

async function verifyKeepsAStageBeforeTheOneAnInterruptedRun(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.events.writeInterruptedRun();

	const row = await runRow(fixture, fixture.interruptedRun);

	expect(row).toMatchObject({
		stageGrades: {
			grades: [
				{ stage: "discuss", status: "no-record" },
				{ stage: "build", status: "no-record" },
			],
			state: "available",
		},
	});
}

async function verifyKeepsAStageThatSavedACheckpointWithoutA(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.write();

	const row = await runRow(fixture, fixture.replayableRun);

	expect(row).toMatchObject({
		stageGrades: {
			grades: [
				{ stage: "discuss", status: "no-record" },
				{ stage: "build", status: "no-record" },
			],
			state: "available",
		},
	});
}

async function verifyKeepsTheRowWithEachFigureUnavailableForThat(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.events.writeEventsOnlyFailedRun();

	const row = await runRow(fixture, fixture.eventsOnlyRun);

	expect(row).toMatchObject({
		cost: { reasons: [NO_MANIFEST_REASON], state: "unavailable" },
		finalOutcome: {
			reasons: [NO_MANIFEST_REASON],
			state: "unavailable",
		},
		firedBlockers: {
			reasons: [NO_MANIFEST_REASON],
			state: "unavailable",
		},
		minimumGrade: {
			reasons: [NO_MANIFEST_REASON],
			state: "unavailable",
		},
		/**
		 * Each expectation is its own object: Bun 1.4.0's toMatchObject
		 * passes a mismatch where one expected object is reused.
		 */
		stageGrades: {
			reasons: [NO_MANIFEST_REASON],
			state: "unavailable",
		},
		wallTime: { reasons: [NO_MANIFEST_REASON], state: "unavailable" },
	});
}

async function verifyKeepsTheRowWithEachFigureUnavailable(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRun();
	await Bun.write(
		benchmarkRunPaths(fixture.runsDirectory, fixture.stoppedRun).stageFile(
			"discuss",
		),
		JSON.stringify({ costUsd: "one dollar", stage: "discuss" }),
	);

	const row = await runRow(fixture, fixture.stoppedRun);

	expect(row).toMatchObject({
		cost: { state: "unavailable" },
		finalOutcome: { state: "unavailable" },
		stageGrades: { state: "unavailable" },
		status: "STOPPED:build",
		wallTime: { state: "unavailable" },
	});
}

function registerHistoryFiguresPipelineStagesWhenTheRunWroteNoManifest(): void {
	it(
		"keeps the row with each figure unavailable for that reason",
		verifyKeepsTheRowWithEachFigureUnavailableForThat,
	);
}

function registerHistoryFiguresPipelineStagesWhenAStageRecordDoesNotParse(): void {
	it(
		"keeps the row with each figure unavailable",
		verifyKeepsTheRowWithEachFigureUnavailable,
	);
}
