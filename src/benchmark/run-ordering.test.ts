import { afterEach, describe, expect, it } from "bun:test";

import { runGradedStages } from "./run";
import { planningStage } from "./run-pipeline-test-fixtures";
import {
	StageContextBuilder,
	testResources,
	unexpectedReports,
} from "./run-stage-context-test-fixture";
import {
	fakeStageDependencies,
	stageFixture,
} from "./run-stage-dependencies-test-fixture";
import { deliveryStage } from "./run-stage-judge-test-fixtures";
import { AUDIT_LOG_RUBRICS_PATH, TEST_TARGET } from "./test-support";

const SECOND_JUDGED_STAGE_INDEX = 1;
const THIRD_JUDGED_STAGE_INDEX = 2;
const SECOND_USED_RUBRIC_INDEX = 1;
const RESOURCE_DRAIN_START_INDEX = 0;
testResources.registerCleanup();
afterEach(() => {
	expect(unexpectedReports.splice(RESOURCE_DRAIN_START_INDEX)).toEqual([]);
});

const expectedWorkflowCount = 2;

const carriesEarlierEvidence = async (): Promise<void> => {
	const { dependencies, judged, executed, context } = await stageFixture();

	const outcome = await runGradedStages(dependencies, context);

	expect(executed).toEqual(["shape", "build"]);
	expect(
		judged[SECOND_JUDGED_STAGE_INDEX]?.priorArtifacts.map(({ path }) => path),
	).toEqual(["backlog/docs/shape.md"]);
	const [observedFirstJudged, observedSecondJudged] = judged;

	expect(observedSecondJudged?.diff).toBe("the-diff");

	expect(observedFirstJudged).not.toHaveProperty("commitSubjects");
	expect(observedSecondJudged?.commitSubjects).toEqual(["build commit"]);
	expect(outcome.buildEvidence?.resultSha).toBe("result-sha");
	expect(outcome.workflow).toHaveLength(expectedWorkflowCount);
};

const carriesPipelineArtifacts = async (): Promise<void> => {
	const { dependencies, judged, executed } = fakeStageDependencies();
	const context = {
		...(await new StageContextBuilder().build()),
		pipeline: {
			stages: [
				planningStage(
					"discuss",
					"spec",
					`${AUDIT_LOG_RUBRICS_PATH}/shape.json`,
				),
				planningStage(
					"grill",
					"grilled",
					`${AUDIT_LOG_RUBRICS_PATH}/shape.json`,
				),
				deliveryStage,
			],
			statuses: ["To Do", "Done"],
			target: TEST_TARGET,
		},
	};

	await runGradedStages(dependencies, context);

	expect(executed).toEqual(["discuss", "grill", "build"]);
	expect(
		judged[THIRD_JUDGED_STAGE_INDEX]?.priorArtifacts.map(({ path }) => path),
	).toEqual(["backlog/docs/discuss.md", "backlog/docs/grill.md"]);
};

const usesDeclaredStageOrder = async (): Promise<void> => {
	const { dependencies, executed } = fakeStageDependencies();
	const context = {
		...(await new StageContextBuilder().build()),
		pipeline: {
			stages: [
				planningStage(
					"discuss",
					"spec",
					`${AUDIT_LOG_RUBRICS_PATH}/shape.json`,
				),
				planningStage("plan", "plan", `${AUDIT_LOG_RUBRICS_PATH}/shape.json`),
				planningStage(
					"grill",
					"grilled",
					`${AUDIT_LOG_RUBRICS_PATH}/shape.json`,
				),
				deliveryStage,
			],
			statuses: ["To Do", "Done"],
			target: TEST_TARGET,
		},
	};

	await runGradedStages(dependencies, context);

	expect(executed).toEqual(["discuss", "plan", "grill", "build"]);
};

const labelsStageTranscript = async (): Promise<void> => {
	const { dependencies, executed } = fakeStageDependencies();
	const context = {
		...(await new StageContextBuilder().build()),
		pipeline: {
			stages: [
				{
					artifact: "findings",
					kind: "planning" as const,
					name: "research",
					requiresAcceptanceCriteria: false,
					rubric: `${AUDIT_LOG_RUBRICS_PATH}/shape.json`,
					skill: "discuss",
				},
				deliveryStage,
			],
			statuses: ["To Do", "Done"],
			target: TEST_TARGET,
		},
	};

	const outcome = await runGradedStages(dependencies, context);

	expect(executed).toEqual(["discuss", "build"]);
	expect(outcome.workflow.map(({ stage }) => stage)).toEqual([
		"research",
		"build",
	]);
	expect(outcome.stageScorecards.map(({ stage }) => stage)).toEqual([
		"research",
		"build",
	]);
};

const runsUnknownStage = async (): Promise<void> => {
	const { dependencies, judged, executed, rubricsUsed } =
		fakeStageDependencies();
	const context = {
		...(await new StageContextBuilder().build()),
		pipeline: {
			stages: [
				planningStage(
					"discuss",
					"spec",
					`${AUDIT_LOG_RUBRICS_PATH}/shape.json`,
				),
				planningStage(
					"research",
					"findings",
					`${AUDIT_LOG_RUBRICS_PATH}/shape.json`,
				),
				planningStage("plan", "plan", `${AUDIT_LOG_RUBRICS_PATH}/shape.json`),
				deliveryStage,
			],
			statuses: ["To Do", "Done"],
			target: TEST_TARGET,
		},
	};

	await runGradedStages(dependencies, context);

	const [, observedSecondJudged] = judged;

	expect(executed).toEqual(["discuss", "research", "plan", "build"]);
	expect(observedSecondJudged?.stage).toBe("research");
	expect(
		rubricsUsed[SECOND_USED_RUBRIC_INDEX]?.endsWith(
			`${AUDIT_LOG_RUBRICS_PATH}/shape.json`,
		),
	).toBe(true);
};
describe("runGradedStages stage order", () => {
	it(
		"runs the stages in order and carries evidence forward",
		carriesEarlierEvidence,
	);

	it(
		"carries every earlier artifact through a multi-stage pipeline",
		carriesPipelineArtifacts,
	);

	it(
		"executes stages in their declared order, not a known one",
		usesDeclaredStageOrder,
	);

	it(
		"labels a transcript with the stage name, not the skill it ran",
		labelsStageTranscript,
	);

	it(
		"executes a fifth stage under a name the harness never knew",
		runsUnknownStage,
	);
});
