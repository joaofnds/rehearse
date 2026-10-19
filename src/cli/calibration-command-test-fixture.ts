import { z } from "zod";

import { recordsDirectory } from "#benchmark/config";
import type { Immutable } from "#benchmark/contracts";
import type { JudgeResult } from "#benchmark/judge";
import type {
	CalibrateDependencies,
	CalibrateRequest,
	CurrentControlSources,
} from "#cli/calibrate-command";
import {
	FINAL_RUBRIC,
	RUN_NAME,
	stageRubricText,
	writeReview,
	writeRunFixture,
} from "#cli/calibrate-test-support";
import type { CliTestWorkspace } from "#cli/cli-test-support";

import StageScorecardBuilder from "./calibration-stage-scorecard-test-builder";

const FIRST_STAGE_SCORECARD_INDEX = 0;

const PROVIDER_CALL_COUNT_INCREMENT = 1;

const STORED_SPEND_CEILING_USD = 100;

const passingProbe = async (): Promise<void> => {
	await Promise.resolve();
};

const storedCeiling = async (): Promise<number> =>
	await Promise.resolve(STORED_SPEND_CEILING_USD);

/**
 * The instructions and the case's final rubric as the run froze them, so a
 * test that means to change only the stage rubric changes only that. Every
 * observation here is over a fixture, and the control repository's own
 * CLAUDE.md and rubric.md are not what the fixture recorded.
 */
const unchangedControlSources = async (): Promise<CurrentControlSources> =>
	await Promise.resolve({
		finalRubric: FINAL_RUBRIC,
		instructions: "Instructions",
	});

const MISSED_SCOPE = {
	description: "The stage never fixed the scope.",
	judgeAssessment: "MISSED",
	paths: ["backlog/docs/spec.md"],
	rubricId: "scope",
	stage: "discuss",
};

const stageRubricPathsSchema = z.array(z.string());

const artifactSchema = z
	.object({
		calibration: z
			.object({
				rejudgeConfirmedByHuman: z.boolean().optional(),
				stageRubricsChanged: stageRubricPathsSchema,
			})
			.optional(),
		judgeAgreement: z.object({ skippedCalibrations: z.number() }).optional(),
		status: z.string(),
	})
	.loose();

function unexpectedCalibrationProvider(): never {
	throw new Error("unexpected calibration provider call");
}

function noRejudge(): CalibrateDependencies["buildJudges"] {
	return () => ({
		finalJudge: unexpectedCalibrationProvider,
		stageJudge: unexpectedCalibrationProvider,
	});
}

async function fixtureWithEditedStageRubric(
	workspace: Readonly<CliTestWorkspace>,
): Promise<Awaited<ReturnType<typeof writeRunFixture>>> {
	const fixture = await writeRunFixture(workspace);
	await Bun.write(
		fixture.stageRubricPath,
		stageRubricText("Scope is explicit and observable"),
	);
	await writeReview(fixture.reviewFile, [MISSED_SCOPE]);

	return fixture;
}

function rejudgingStage(): CalibrateDependencies["buildJudges"] {
	return () => ({
		finalJudge: async () =>
			await Promise.reject(new Error("no final rejudge in this test")),
		stageJudge: async (_scorecard, source) =>
			await Promise.resolve({
				...new StageScorecardBuilder({ rubricPath: source.rubricPath })
					.withScopeResult({ status: "FAIL" })
					.build(),
				rubric: source.rubric,
			}),
	});
}

interface UnavailableJudgeMessages {
	readonly final: string;
	readonly stage: string;
}
function unavailableCalibrationJudges(
	messages: UnavailableJudgeMessages,
): ReturnType<CalibrateDependencies["buildJudges"]> {
	return {
		finalJudge: async () => await Promise.reject(new Error(messages.final)),
		stageJudge: async () => await Promise.reject(new Error(messages.stage)),
	};
}

class CalibrateRequestBuilder {
	public constructor(
		private readonly props: Immutable<Partial<CalibrateRequest>> = {},
	) {}
	public build(): CalibrateRequest {
		return {
			confirmRejudge: false,
			id: RUN_NAME,
			json: false,
			readCurrentSources: unchangedControlSources,
			runsDirectory: this.props.runsDirectory ?? recordsDirectory(),
			...this.props,
		};
	}
}

const REVISED_FINAL_JUDGE_RESULT: JudgeResult = {
	attempts: [],
	costUsd: 0,
	grade: {
		requirements: [
			{
				evidence: [
					{
						claim: "metadata missing",
						path: "src/audit/worker.ts",
						source: "diff",
					},
				],
				id: "worker-metadata",
				status: "FAIL",
			},
		],
		summary: "revised",
		verdict: "FAIL",
	},
	prompt: "revised prompt",
};

export {
	artifactSchema,
	CalibrateRequestBuilder,
	FIRST_STAGE_SCORECARD_INDEX,
	fixtureWithEditedStageRubric,
	MISSED_SCOPE,
	noRejudge,
	passingProbe,
	PROVIDER_CALL_COUNT_INCREMENT,
	rejudgingStage,
	REVISED_FINAL_JUDGE_RESULT,
	stageRubricPathsSchema,
	storedCeiling,
	unavailableCalibrationJudges,
	unchangedControlSources,
};
