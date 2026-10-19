import { mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CalibrationContext } from "./calibration-context";
import {
	calibrationStageInput,
	stageJudgeOutput,
	stageScorecard,
} from "./calibration-grade-test-fixtures";
import { CommandError } from "./command";
import type { StageScorecard } from "./contracts";
import type { JudgeAttempt } from "./judge-attempt";
import { parseStageRubric } from "./stage-rubric";
import {
	AUDIT_LOG_CASE_DIR,
	AUDIT_LOG_RUBRICS_PATH,
	PROJECT_ROOT,
	TestResources,
	ampleSpendCeiling,
} from "./test-support";

const INITIAL_RESOLUTION_NUMBER = 1;

const FIRST_REVISED_STAGE_SCORECARD_INDEX = 0;

const RESOLUTION_COUNT_INCREMENT = 1;

const testResources = new TestResources();

const ignoreLog = (): undefined => undefined;

const failOnReport = (message: string): never => {
	throw new Error(`unexpected calibration report: ${message}`);
};

async function temporaryCalibrationDirectory(prefix: string): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), prefix));
	testResources.track(directory);

	return directory;
}

async function calibrationContext(
	directory: string,
	overrides: Partial<CalibrationContext> & Pick<CalibrationContext, "rl">,
): Promise<CalibrationContext> {
	const { rl, ...properties } = overrides;
	return {
		finalRubricPath: join(PROJECT_ROOT, AUDIT_LOG_CASE_DIR, "rubric.md"),
		judgeModel: "sonnet",
		log: ignoreLog,
		originalInstructions: "instructions\n",
		originalRubric:
			overrides.originalRubric ??
			(await Bun.file(
				join(PROJECT_ROOT, AUDIT_LOG_CASE_DIR, "rubric.md"),
			).text()),
		reportError: failOnReport,
		reviewFile: join(directory, "review.json"),
		rl,
		rubricsDirectory: join(PROJECT_ROOT, AUDIT_LOG_RUBRICS_PATH),
		sessionBudgetUsd: 5,
		spendCeiling: ampleSpendCeiling(),
		stageScorecards: [],
		targetDir: directory,
		...properties,
	};
}

async function corpusPermissionFixture(): Promise<LiveInstallFixture> {
	const reviewDirectory =
		await temporaryCalibrationDirectory("rehearse-review-");
	const installRoot = await temporaryCalibrationDirectory("rehearse-install-");
	const firstBackingRoot = await temporaryCalibrationDirectory(
		"rehearse-backing-first-",
	);
	const secondBackingRoot = await temporaryCalibrationDirectory(
		"rehearse-backing-second-",
	);
	await Bun.write(
		join(firstBackingRoot, "CLAUDE.md"),
		"captured instructions\n",
	);
	await symlink(
		join(firstBackingRoot, "CLAUDE.md"),
		join(installRoot, "CLAUDE.md"),
	);
	const reviewFile = join(reviewDirectory, "review.json");

	return {
		firstBackingRoot,
		installRoot,
		reviewDirectory,
		reviewFile,
		secondBackingRoot,
	};
}

async function stageFailureFixture(
	reviewDirectory: string,
): Promise<StageScorecard> {
	const rubricPath = join(reviewDirectory, "discuss.json");
	const rubricContent = JSON.stringify({
		dimensions: [
			{
				description: "Clear output",
				excellent: "Precise",
				good: "Concrete",
				id: "clarity",
			},
		],
		hardBlockers: [
			{ description: "Valid delivery", id: "invalid-stage-delivery" },
		],
		requirements: [{ description: "Scope is explicit", id: "scope" }],
		stage: "discuss",
	});
	await Bun.write(rubricPath, rubricContent);
	const rubric = parseStageRubric(rubricContent);
	const scorecard: StageScorecard = {
		attempts: [],
		costUsd: 1,
		grade: {
			...stageJudgeOutput("PASS", "FAIL", "F"),
			grade: "F",
			verdict: "STOP",
		},
		input: calibrationStageInput(),
		prompt: "prompt",
		rubric,
		rubricPath,
		stage: "discuss",
	};

	return scorecard;
}

async function rejudgeFixture(
	reviewDirectory: string,
): Promise<RejudgeFixture> {
	const rubricPath = join(reviewDirectory, "discuss.json");
	const original = stageScorecard("FAIL");
	const updatedRubric = {
		...original.rubric,
		requirements: [
			{ description: "Scope is explicit and observable", id: "scope" },
		],
	};
	await Bun.write(rubricPath, JSON.stringify(updatedRubric));
	const attempts: readonly JudgeAttempt[] = [
		{
			costUsd: 0.4,
			outcome: "ACCEPTED",
			payload: { summary: "rejudged" },
		},
	];
	const revised = {
		...original,
		attempts,
		costUsd: 0.4,
		rubric: parseStageRubric(JSON.stringify(updatedRubric)),
		rubricPath,
	};

	return { attempts, original, revised, rubricPath };
}

const EXPECTED_SINGLE_REVIEW = 1;

const LAST_REVIEW_RESPONSE = -1;

interface ReviewResponse {
	readonly review?: string;
	readonly answer: string;
}

interface ReviewScript {
	readonly reviewFile: string;
	readonly responses: readonly ReviewResponse[];
	readonly repeatLast?: boolean;
}

interface ReviewConversation {
	readonly prompts: readonly string[];
	readonly errors: readonly string[];
	readonly interaction: readonly string[];
	readonly question: (prompt: string) => Promise<string>;
	readonly reportError: (message: string) => Promise<void>;
}

function reviewConversation({
	reviewFile,
	responses,
	repeatLast = true,
}: ReviewScript): ReviewConversation {
	const prompts: string[] = [];
	const errors: string[] = [];
	const interaction: string[] = [];
	const pending = [...responses];

	return {
		errors,
		interaction,
		prompts,
		question: async (prompt) => {
			const response =
				pending.shift() ??
				(repeatLast ? responses.at(LAST_REVIEW_RESPONSE) : undefined);
			if (response === undefined) {
				throw new CommandError(["calibration"], {
					exitCode: 1,
					stderr: "re-prompted",
					stdout: "",
				});
			}

			interaction.push("prompt");
			prompts.push(prompt);
			if (response.review !== undefined) {
				await Bun.write(reviewFile, response.review);
			}

			return response.answer;
		},
		reportError: async (message) => {
			await Promise.resolve();
			errors.push(message);
			interaction.push("diagnostic");
		},
	};
}

function rejectedReviewText(summary: string): string {
	return `${JSON.stringify({ findings: [], summary, verdict: "REJECT" })}\n`;
}

async function calibrationWorkspace(): Promise<{
	readonly reviewDirectory: string;
	readonly reviewFile: string;
}> {
	const reviewDirectory =
		await temporaryCalibrationDirectory("rehearse-review-");
	return { reviewDirectory, reviewFile: join(reviewDirectory, "review.json") };
}

async function linkedInstructionDirectory(): Promise<string> {
	const linked = await temporaryCalibrationDirectory("rehearse-linked-");
	await Bun.write(join(linked, "CLAUDE.md"), "linked instructions\n");

	return linked;
}

interface LiveInstallFixture {
	readonly reviewDirectory: string;
	readonly reviewFile: string;
	readonly installRoot: string;
	readonly firstBackingRoot: string;
	readonly secondBackingRoot: string;
}

interface RejudgeFixture {
	readonly original: StageScorecard;
	readonly revised: StageScorecard;
	readonly attempts: readonly JudgeAttempt[];
	readonly rubricPath: string;
}

export {
	INITIAL_RESOLUTION_NUMBER,
	FIRST_REVISED_STAGE_SCORECARD_INDEX,
	RESOLUTION_COUNT_INCREMENT,
	calibrationContext,
	corpusPermissionFixture,
	stageFailureFixture,
	rejudgeFixture,
	EXPECTED_SINGLE_REVIEW,
	reviewConversation,
	rejectedReviewText,
	calibrationWorkspace,
	linkedInstructionDirectory,
	testResources,
};
