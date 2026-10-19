import { afterEach, describe, expect, it } from "bun:test";

import { confirmationGroupPaths } from "#benchmark/run-layout";
import { gradeRepStage } from "#server/history-figures-record-test-fixture";
import {
	clearFigureRoots,
	emptyFixture,
	onlyRowOfKind,
} from "#server/history-figures-workspace-test-fixture";

import {
	NO_GRADED_BLOCKERS_REASON,
	SESSION_BLOCKERS_REASON,
} from "./run-history";

afterEach(clearFigureRoots);

const SINGLE_SESSION_REP_COUNT = 1;

describe("/api/runs", () => {
	describe("GET", () => {
		describe("a confirmation group row", () => {
			it(
				"carries the ids of the hard blockers its reps' stage judges found fired",
				verifyCarriesTheIdsOfTheHardBlockersItsReps,
			);

			it(
				"takes no id from a rejected rep stage whose judge attempt fired one",
				verifyTakesNoIdFromARejectedRepStageWhose,
			);

			it(
				"carries its fired blockers as unavailable when a rep's stage record is unreadable",
				verifyCarriesItsFiredBlockersAsUnavailableWhenARep,
			);

			it(
				"carries its fired blockers as not recorded when no rep's stage record graded them",
				verifyCarriesItsFiredBlockersAsNotRecordedWhenNo,
			);

			it(
				"carries a session group's fired blockers as unavailable, since checks grade its reps",
				verifyCarriesASessionGroupSFiredBlockersAsUnavailable,
			);
		});
	});
});

async function verifyCarriesTheIdsOfTheHardBlockersItsReps(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.confirmations.records.writePipelineGroup("pipeline-group", [
		{ build: "B", discussion: "A", final: "pass" },
		{ build: "B", discussion: "A", final: "pass" },
	]);
	const paths = confirmationGroupPaths(fixture.runsDirectory, "pipeline-group");
	await gradeRepStage(paths.rep("pipeline-group-rep-1").stageFile("build"), [
		{ id: "invalid-stage-delivery", status: "FAIL" },
		{ id: "invented-scope", status: "PASS" },
	]);
	await gradeRepStage(paths.rep("pipeline-group-rep-2").stageFile("discuss"), [
		{ id: "material-decision-open", status: "FAIL" },
	]);

	const row = await onlyRowOfKind(fixture, "group");

	expect(row).toMatchObject({
		firedBlockers: {
			ids: ["invalid-stage-delivery", "material-decision-open"],
			state: "available",
		},
	});
}

async function verifyTakesNoIdFromARejectedRepStageWhose(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.confirmations.records.writePipelineGroup("pipeline-group", [
		{ build: "B", discussion: "A", final: "pass" },
		{ build: "B", discussion: "A", final: "pass" },
	]);
	const paths = confirmationGroupPaths(fixture.runsDirectory, "pipeline-group");
	await Bun.write(
		paths.rep("pipeline-group-rep-1").stageFile("build"),
		JSON.stringify({
			attempts: [
				{
					payload: {
						hardBlockers: [{ id: "invalid-stage-delivery", status: "FAIL" }],
					},
				},
			],
			error: "the judge rejected the stage",
			stage: "build",
			status: "REJECTED",
		}),
	);
	await gradeRepStage(paths.rep("pipeline-group-rep-2").stageFile("discuss"), [
		{ id: "material-decision-open", status: "FAIL" },
	]);

	const row = await onlyRowOfKind(fixture, "group");

	expect(row).toMatchObject({
		firedBlockers: {
			ids: ["material-decision-open"],
			state: "available",
		},
	});
}

async function verifyCarriesItsFiredBlockersAsUnavailableWhenARep(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.confirmations.records.writePipelineGroup("pipeline-group", [
		{ build: "B", discussion: "A", final: "pass" },
		{ build: "B", discussion: "A", final: "pass" },
	]);
	const paths = confirmationGroupPaths(fixture.runsDirectory, "pipeline-group");
	await Bun.write(
		paths.rep("pipeline-group-rep-1").stageFile("build"),
		"{ not json",
	);
	await gradeRepStage(paths.rep("pipeline-group-rep-2").stageFile("discuss"), [
		{ id: "material-decision-open", status: "FAIL" },
	]);

	const row = await onlyRowOfKind(fixture, "group");

	expect(row).toMatchObject({
		firedBlockers: {
			reasons: ["the build stage record of pipeline-group-rep-1 is unreadable"],
			state: "unavailable",
		},
	});
}

async function verifyCarriesItsFiredBlockersAsNotRecordedWhenNo(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.confirmations.records.writePipelineGroup("pipeline-group", [
		{ build: "B", discussion: "A", final: "pass" },
		{ build: "B", discussion: "A", final: "pass" },
	]);

	const row = await onlyRowOfKind(fixture, "group");

	expect(row).toMatchObject({
		firedBlockers: {
			reasons: [NO_GRADED_BLOCKERS_REASON],
			state: "unavailable",
		},
	});
}

async function verifyCarriesASessionGroupSFiredBlockersAsUnavailable(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.confirmations.records.writeSessionGroup(
		"session-group",
		SINGLE_SESSION_REP_COUNT,
	);

	const row = await onlyRowOfKind(fixture, "group");

	expect(row).toMatchObject({
		firedBlockers: {
			reasons: [SESSION_BLOCKERS_REASON],
			state: "unavailable",
		},
	});
}
