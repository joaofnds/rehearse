import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { archiveConfirmation } from "#benchmark/confirmation-archive";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import {
	FIRST_RUN,
	writeJudgedStage,
	writeRepStage,
	writeReplayStage,
	writeStoppedStage,
} from "#server/calibration-case-fixture";
import { INPUT } from "#server/calibration-case-test-data";
import {
	appFor,
	clearCalibrationRoots,
	postGrade,
	recordsDirectory,
} from "#server/calibration-http-fixture";
import OperatorGradeBuilder from "#server/calibration-operator-grade-test-builder";
import CalibrationScorecardBuilder from "#server/calibration-scorecard-test-builder";
import StageGradeBuilder from "#server/calibration-stage-grade-test-builder";

afterEach(clearCalibrationRoots);

describe("calibration catalog", () => {
	it(
		"lists saved rep, replay and stopped stages in their recorded order",
		verifyListsSavedRepReplayAndStoppedStagesInTheir,
	);

	it(
		"moves graded replay and rep stages into agreement rows before the next stopped stage",
		verifyMovesGradedReplayAndRepStagesIntoAgreementRows,
	);

	it(
		"keeps a partial rep stage gradeable without a group summary after explicit archive",
		verifyKeepsAPartialRepStageGradeableWithoutAGroup,
	);

	it(
		"places a rep stage among run stages by the start time its group recorded",
		verifyPlacesARepStageAmongRunStagesByThe,
	);
});

async function verifyListsSavedRepReplayAndStoppedStagesInTheir(): Promise<void> {
	const runsDirectory = await recordsDirectory();
	await writeRepStage(runsDirectory, "group-1");
	await writeReplayStage(runsDirectory);
	await writeStoppedStage(runsDirectory, FIRST_RUN);

	const before = await appFor(runsDirectory).request("/api/calibration");
	const stopReview = await appFor(runsDirectory).request(
		`/api/calibration/runs/${FIRST_RUN}/stages/shape`,
	);
	expect(await before.json()).toMatchObject({
		next: {
			kind: "replay",
			lineage: "lineage-1",
			timestamp: "2026-09-30T10-00-00.000Z",
		},
		ungraded: 3,
	});
	expect(await stopReview.json()).toMatchObject({
		criteria: {
			dimensions: [{ id: "clarity" }, { id: "decision-quality" }],
			hardBlockers: [{ id: "invalid-stage-delivery" }],
			requirements: [{ id: "goal-stated" }],
		},
	});
}

async function verifyMovesGradedReplayAndRepStagesIntoAgreementRows(): Promise<void> {
	const runsDirectory = await recordsDirectory();
	await writeRepStage(runsDirectory, "group-1");
	await writeReplayStage(runsDirectory);
	await writeStoppedStage(runsDirectory, FIRST_RUN);

	const repGrade = await postGrade(
		runsDirectory,
		"/api/calibration/groups/group-1/reps/rep-1/stages/shape",
		JSON.stringify(
			new OperatorGradeBuilder({
				dimensions: [
					{ grade: "C", id: "clarity" },
					{ grade: "C", id: "decision-quality" },
				],
			}).build(),
		),
	);
	const replayGrade = await postGrade(
		runsDirectory,
		"/api/calibration/replays/lineage-1/2026-09-30T10-00-00.000Z",
		JSON.stringify(
			new OperatorGradeBuilder({
				dimensions: [
					{ grade: "B", id: "clarity" },
					{ grade: "C", id: "decision-quality" },
				],
			}).build(),
		),
	);
	const after = await appFor(runsDirectory).request("/api/calibration");

	expect([repGrade.status, replayGrade.status]).toEqual([
		HTTP_STATUS.HTTP_STATUS_CREATED,
		HTTP_STATUS.HTTP_STATUS_CREATED,
	]);
	expect(await after.json()).toMatchObject({
		next: { kind: "run", run: FIRST_RUN, stage: "shape" },
		rows: [
			{ judgeModel: "haiku", stageName: "decompose", stepsApart: 0 },
			{ judgeModel: "sonnet", stageName: "shape", stepsApart: 0 },
		],
		ungraded: 1,
	});
}

async function verifyKeepsAPartialRepStageGradeableWithoutAGroup(): Promise<void> {
	const runsDirectory = await recordsDirectory();
	const group = confirmationGroupPaths(runsDirectory, "partial-group");
	const grade = new StageGradeBuilder({
		dimensions: [
			{ evidence: [], grade: "C", id: "clarity" },
			{ evidence: [], grade: "C", id: "decision-quality" },
		],
	}).build();

	await Bun.write(
		group.rep("rep-1").stageFile("shape"),
		JSON.stringify({
			stage: "shape",
			...new CalibrationScorecardBuilder({
				grade,
				input: { ...INPUT, stage: "shape" },
			}).build(),
		}),
	);
	await archiveConfirmation({
		archivedAt: "2026-10-18T12:00:00.000Z",
		groupId: "partial-group",
		runsDirectory,
	});

	const response = await appFor(runsDirectory).request("/api/calibration");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toMatchObject({
		next: {
			groupId: "partial-group",
			kind: "rep",
			repId: "rep-1",
			stage: "shape",
		},
		ungraded: 1,
	});
	expect(await Bun.file(group.groupFile).exists()).toBe(false);
}

async function verifyPlacesARepStageAmongRunStagesByThe(): Promise<void> {
	const runsDirectory = await recordsDirectory();
	await writeJudgedStage(runsDirectory, {
		dimensions: ["B", "B"],
		run: FIRST_RUN,
	});
	await writeJudgedStage(runsDirectory, {
		dimensions: ["B", "B"],
		run: "2026-10-01T10-45-00.000Z",
	});
	const group = confirmationGroupPaths(runsDirectory, "group-1");
	await Bun.write(
		group.groupFile,
		JSON.stringify({
			inputs: { judgeModel: "sonnet" },
			startedAt: "2026-10-01T10:30:00.000Z",
		}),
	);
	const grade = new StageGradeBuilder({
		dimensions: [
			{ evidence: [], grade: "C", id: "clarity" },
			{ evidence: [], grade: "C", id: "decision-quality" },
		],
	}).build();

	await Bun.write(
		group.rep("rep-1").stageFile("shape"),
		JSON.stringify({
			stage: "shape",
			...new CalibrationScorecardBuilder({
				grade,
				input: { ...INPUT, stage: "shape" },
			}).build(),
		}),
	);
	await postGrade(
		runsDirectory,
		`/api/calibration/runs/${FIRST_RUN}/stages/shape`,
		JSON.stringify(new OperatorGradeBuilder().build()),
	);

	const response = await appFor(runsDirectory).request("/api/calibration");

	expect(await response.json()).toMatchObject({
		next: { groupId: "group-1", kind: "rep", repId: "rep-1", stage: "shape" },
		ungraded: 2,
	});
}
