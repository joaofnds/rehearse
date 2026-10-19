import { afterEach, describe, expect, it } from "bun:test";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import { RECORDED_READINGS } from "#benchmark/run-records-test-support";
import FINAL_OUTCOMES from "#server/history-figures-outcome-cases";
import {
	clearFigureRoots,
	emptyFixture,
	runRow,
} from "#server/history-figures-workspace-test-fixture";

import { NO_GRADED_BLOCKERS_REASON } from "./run-history";
import { MINIMUM_GRADE_REASON } from "./run-record";

afterEach(clearFigureRoots);

describe("/api/runs", () => {
	describe("GET", () => {
		describe("a pipeline run row", () => {
			it.each(FINAL_OUTCOMES.map((row) => [row.outcome, row]))(
				"carries the final outcome as %s",
				async (_outcome, { write, run, liveness, finalOutcome }) => {
					const fixture = await emptyFixture();
					await write(fixture);

					const row = await runRow(fixture, run(fixture), liveness);

					expect(row).toMatchObject({ finalOutcome });
				},
			);

			it(
				"carries the minimum grade its manifest set",
				verifyCarriesTheMinimumGradeItsManifestSet,
			);

			it(
				"carries its minimum grade as not recorded when its manifest predates it",
				verifyCarriesItsMinimumGradeAsNotRecordedWhenIts,
			);

			it(
				"carries the ids of the hard blockers its stage judges found fired",
				verifyCarriesTheIdsOfTheHardBlockersItsStage,
			);

			it(
				"names a blocker two of its stages fired once",
				verifyNamesABlockerTwoOfItsStagesFiredOnce,
			);

			it(
				"carries its fired blockers as not recorded when no stage record graded them",
				verifyCarriesItsFiredBlockersAsNotRecordedWhenNo,
			);
		});
	});
});

async function verifyCarriesTheMinimumGradeItsManifestSet(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunWithReadings();

	const row = await runRow(fixture, fixture.stoppedRun);

	expect(row).toMatchObject({
		minimumGrade: {
			letter: RECORDED_READINGS.minimumGrade,
			state: "available",
		},
	});
}

async function verifyCarriesItsMinimumGradeAsNotRecordedWhenIts(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRun();

	const row = await runRow(fixture, fixture.stoppedRun);

	expect(row).toMatchObject({
		minimumGrade: {
			reasons: [MINIMUM_GRADE_REASON],
			state: "unavailable",
		},
	});
}

async function verifyCarriesTheIdsOfTheHardBlockersItsStage(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunWithReadings();

	const row = await runRow(fixture, fixture.stoppedRun);

	expect(row).toMatchObject({
		firedBlockers: {
			ids: ["no-secrets-in-diff", "no-unrelated-refactors"],
			state: "available",
		},
	});
}

async function verifyNamesABlockerTwoOfItsStagesFiredOnce(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRunWithReadings();
	const discuss = benchmarkRunPaths(
		fixture.runsDirectory,
		fixture.stoppedRun,
	).stageFile("discuss");
	await Bun.write(
		discuss,
		JSON.stringify({
			...(await Bun.file(discuss).json()),
			grade: {
				grade: "C",
				hardBlockers: [
					{ id: "scope-declared", status: "FAIL" },
					{ id: "no-secrets-in-diff", status: "FAIL" },
				],
				verdict: "CONTINUE",
			},
		}),
	);

	const row = await runRow(fixture, fixture.stoppedRun);

	expect(row).toMatchObject({
		firedBlockers: {
			ids: ["scope-declared", "no-secrets-in-diff", "no-unrelated-refactors"],
			state: "available",
		},
	});
}

async function verifyCarriesItsFiredBlockersAsNotRecordedWhenNo(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.stopped.writeStoppedRun();

	const row = await runRow(fixture, fixture.stoppedRun);

	expect(row).toMatchObject({
		firedBlockers: {
			reasons: [NO_GRADED_BLOCKERS_REASON],
			state: "unavailable",
		},
	});
}
