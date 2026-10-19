import { describe, expect, it } from "bun:test";

import { collectCalibration } from "./calibration";
import {
	EXPECTED_SINGLE_REVIEW,
	FIRST_REVISED_STAGE_SCORECARD_INDEX,
	calibrationContext,
	calibrationWorkspace,
	rejectedReviewText,
	rejudgeFixture,
	reviewConversation,
	stageFailureFixture,
	testResources,
} from "./calibration-interaction-test-fixtures";

testResources.registerCleanup();

async function recordsARubricMdEditDuringStageFailureCalibrationWithoutAFinalRejudge(): Promise<void> {
	const { reviewDirectory, reviewFile } = await calibrationWorkspace();

	const scorecard = await stageFailureFixture(reviewDirectory);

	const conversation = reviewConversation({
		repeatLast: false,
		responses: [
			{
				answer: "",
				review: rejectedReviewText("The discuss stage missed scope."),
			},
		],
		reviewFile,
	});

	const result = await collectCalibration(
		await calibrationContext(reviewDirectory, {
			originalRubric: "1. `old`: Old requirement.\n",
			rl: conversation,
			stageScorecards: [scorecard],
		}),
	);

	const [observedFirstQuestion] = conversation.prompts;

	expect(conversation.prompts).toHaveLength(EXPECTED_SINGLE_REVIEW);
	expect(observedFirstQuestion).not.toContain("rubric.md");
	expect(result.rubricChanged).toBe(true);
	expect(result.updatedRubric).toBeDefined();
	expect(result.revisedGrade).toBeUndefined();
}

async function retainsJudgeAttemptsFromAStageRubricRejudge(): Promise<void> {
	const { reviewDirectory, reviewFile } = await calibrationWorkspace();

	const { original, revised, attempts, rubricPath } =
		await rejudgeFixture(reviewDirectory);

	const conversation = reviewConversation({
		responses: [
			{ answer: "", review: rejectedReviewText("The stage failed.") },
			{ answer: "yes" },
		],
		reviewFile,
	});

	const result = await collectCalibration(
		await calibrationContext(reviewDirectory, {
			rl: conversation,
			stageJudge: async () => await Promise.resolve(revised),
			stageScorecards: [{ ...original, rubricPath }],
		}),
	);

	expect(
		result.revisedStageScorecards?.[FIRST_REVISED_STAGE_SCORECARD_INDEX]
			?.attempts,
	).toBe(attempts);
}
describe(collectCalibration.name, () => {
	it(
		"records a rubric.md edit during stage-failure calibration without a final rejudge",
		recordsARubricMdEditDuringStageFailureCalibrationWithoutAFinalRejudge,
	);
	it(
		"retains Judge attempts from a stage rubric rejudge",
		retainsJudgeAttemptsFromAStageRubricRejudge,
	);
});
