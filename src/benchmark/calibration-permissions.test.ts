import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import type { ResolvedCorpusSource } from "#benchmark/corpus-source";

import { collectCalibration } from "./calibration";
import {
	INITIAL_RESOLUTION_NUMBER,
	RESOLUTION_COUNT_INCREMENT,
	calibrationContext,
	calibrationWorkspace,
	corpusPermissionFixture,
	linkedInstructionDirectory,
	rejectedReviewText,
	reviewConversation,
	testResources,
} from "./calibration-interaction-test-fixtures";
import { recordsDirectory } from "./config";
import { liveCorpusSource } from "./corpus-file";
import { linkCorpus, unlinkCorpus } from "./corpus-source";

testResources.registerCleanup();

const EXPECTED_PROMPT_COUNT = 2;
const EXPECTED_ERROR_COUNT = 1;

async function keepsOneLiveCorpusPermissionWhileWaitingForReview(): Promise<void> {
	const expectedResolutions = 1;

	const {
		reviewDirectory,
		reviewFile,
		installRoot,
		firstBackingRoot,
		secondBackingRoot,
	} = await corpusPermissionFixture();
	let resolutions = 0;
	const conversation = reviewConversation({
		responses: [{ answer: "", review: rejectedReviewText("Reviewed.") }],
		reviewFile,
	});

	const result = await collectCalibration(
		await calibrationContext(reviewDirectory, {
			originalInstructions: "captured instructions\n",
			resolveCorpus: async () => {
				resolutions += RESOLUTION_COUNT_INCREMENT;

				return await Promise.resolve<ResolvedCorpusSource>({
					backingRoot:
						resolutions === INITIAL_RESOLUTION_NUMBER
							? firstBackingRoot
							: secondBackingRoot,
					kind: "live",
					root: installRoot,
				});
			},
			rl: conversation,
		}),
	);

	expect(resolutions).toBe(expectedResolutions);
	expect(result.instructionsChanged).toBe(false);
}

async function rePromptsAfterInvalidReviewJSONAndAcceptsTheCorrectedReview(): Promise<void> {
	const { reviewDirectory, reviewFile } = await calibrationWorkspace();

	const conversation = reviewConversation({
		responses: [
			{ answer: "", review: "not json" },
			{ answer: "", review: rejectedReviewText("Stage failed.") },
		],
		reviewFile,
	});

	const result = await collectCalibration(
		await calibrationContext(reviewDirectory, {
			reportError: conversation.reportError,
			rl: conversation,
		}),
	);

	const [observedFirstError] = conversation.errors;

	expect(conversation.prompts).toHaveLength(EXPECTED_PROMPT_COUNT);
	expect(conversation.interaction).toEqual(["prompt", "diagnostic", "prompt"]);
	expect(conversation.errors).toHaveLength(EXPECTED_ERROR_COUNT);
	expect(observedFirstError).toMatch(/^Calibration incomplete: .*JSON/u);
	expect(result.humanReview.verdict).toBe("REJECT");
}

async function namesTheLiveInstallSInstructionsAsTheEditTargetWhileADirectoryIsLinked(): Promise<void> {
	const { reviewDirectory, reviewFile } = await calibrationWorkspace();
	const linked = await linkedInstructionDirectory();

	const conversation = reviewConversation({
		responses: [{ answer: "", review: rejectedReviewText("Reviewed.") }],
		reviewFile,
	});
	await linkCorpus(recordsDirectory(), linked);

	try {
		await collectCalibration(
			await calibrationContext(reviewDirectory, {
				rl: conversation,
			}),
		);
	} finally {
		await unlinkCorpus(recordsDirectory());
	}

	const [observedFirstPrompt] = conversation.prompts;

	expect(observedFirstPrompt).toContain(
		join(liveCorpusSource().root, "CLAUDE.md"),
	);
	expect(observedFirstPrompt).not.toContain(linked);
}
describe(collectCalibration.name, () => {
	it(
		"keeps one live corpus permission while waiting for review",
		keepsOneLiveCorpusPermissionWhileWaitingForReview,
	);
	it(
		"re-prompts after invalid review JSON and accepts the corrected review",
		rePromptsAfterInvalidReviewJSONAndAcceptsTheCorrectedReview,
	);
	it(
		"names the live install's instructions as the edit target while a directory is linked",
		namesTheLiveInstallSInstructionsAsTheEditTargetWhileADirectoryIsLinked,
	);
});
