import { afterEach, describe, expect, it } from "bun:test";

import { JudgeOutputValidationError } from "./judge-attempt";
import { runGradedStages } from "./run";
import {
	StageContextBuilder,
	noCalibration,
	testResources,
	unexpectedReports,
} from "./run-stage-context-test-fixture";
import {
	fakeStageDependencies,
	stoppedStageDependencies,
} from "./run-stage-dependencies-test-fixture";
import { atCeiling } from "./run-stage-spending-test-fixtures";
import { StageQualityError } from "./stage-grade";

const RESOURCE_DRAIN_START_INDEX = 0;
testResources.registerCleanup();
afterEach(() => {
	expect(unexpectedReports.splice(RESOURCE_DRAIN_START_INDEX)).toEqual([]);
});

const recordsStoppedReadManifest = async (): Promise<void> => {
	const { dependencies } = stoppedStageDependencies();
	const { persistence, abort } = atCeiling();
	const context = {
		...(await new StageContextBuilder().build()),
		calibrateStageFailure: noCalibration,
		completeStage: abort.completeStage,
		updatePendingStage: abort.updatePendingStage,
		writePendingStage: abort.writePendingStage,
		writeStageProgress: abort.writeStageProgress,
	};

	const stopped = runGradedStages(dependencies, context);

	expect(stopped).rejects.toBeInstanceOf(StageQualityError);
	await Promise.allSettled([stopped]);

	await abort.markAborted("shape stage graded F; minimum grade is C");

	const record: unknown = JSON.parse(
		persistence.files.get(context.stageFile("shape")) ?? "",
	);
	expect(record).toMatchObject({
		readManifest: [
			{
				evidence: "declared",
				half: "corpus",
				path: "CLAUDE.md",
				role: "global instructions",
			},
			{ path: "skills/shape/SKILL.md", role: "stage skill" },
			{ path: "cases/audit-log/rubrics/shape.json", role: "judge rubric" },
		],
		status: "STAGE_JUDGE_FAILED",
	});
};
const INVALID_JUDGE_OUTCOMES = [
	[
		"its judge output never validates",
		new JudgeOutputValidationError({
			attempts: [],
			costUsd: 0.1,
			message: "invalid evidence",
			prompt: "original prompt",
		}),
	],
	["its judge process fails", new Error("judge exited 1")],
] satisfies readonly (readonly [string, Error])[];
const preservesFailedReadings = async (
	_when: string,
	failure: Readonly<Error>,
): Promise<void> => {
	const { dependencies } = fakeStageDependencies();
	const { persistence, abort } = atCeiling();
	const context = {
		...(await new StageContextBuilder().build()),
		updatePendingStage: abort.updatePendingStage,
		writePendingStage: abort.writePendingStage,
	};
	const failing = {
		...dependencies,
		runStageJudge: async () => await Promise.reject(failure),
	};

	const outcome = runGradedStages(failing, context);

	expect(outcome).rejects.toBe(failure);
	await Promise.allSettled([outcome]);

	await abort.markAborted(failure.message);

	const record: unknown = JSON.parse(
		persistence.files.get(context.stageFile("shape")) ?? "",
	);
	expect(record).toMatchObject({
		readManifest: [
			{
				evidence: "declared",
				half: "corpus",
				path: "CLAUDE.md",
				role: "global instructions",
			},
			{ path: "skills/shape/SKILL.md", role: "stage skill" },
			{ path: "cases/audit-log/rubrics/shape.json", role: "judge rubric" },
		],
		status: "STAGE_JUDGE_FAILED",
	});
};
describe("runGradedStages failure readings", () => {
	it(
		"keeps what a stopped stage declared and loaded on its stop record, since it saves no checkpoint",
		recordsStoppedReadManifest,
	);

	it.each(INVALID_JUDGE_OUTCOMES)(
		"keeps what a stage declared and loaded on its failure record when %s",
		preservesFailedReadings,
	);
});
