import { afterEach, describe, expect, it } from "bun:test";

import { StageValidationError } from "./contracts";
import { runGradedStages } from "./run";
import {
	StageContextBuilder,
	testResources,
	unexpectedReports,
} from "./run-stage-context-test-fixture";
import { fakeStageDependencies } from "./run-stage-dependencies-test-fixture";
import type {
	StageJudgeExecution,
	StageJudgment,
} from "./run-stage-judge-test-fixtures";
import { deliveryStage } from "./run-stage-judge-test-fixtures";
import { harnessResult } from "./test-support";

const CHECK_INVOCATION_COUNT_INCREMENT = 1;
const RESOURCE_DRAIN_START_INDEX = 0;
testResources.registerCleanup();
afterEach(() => {
	expect(unexpectedReports.splice(RESOURCE_DRAIN_START_INDEX)).toEqual([]);
});

const expectedCheckRuns = 1;

const checksAfterValidation = async (): Promise<void> => {
	const { dependencies } = fakeStageDependencies();
	const events: string[] = [];
	const observedCommands: string[][] = [];
	const target = {
		checks: [{ command: ["bun", "run", "custom-check"] }],
		integrityFiles: ["custom-check.json"],
	};
	const context = {
		...(await new StageContextBuilder().build()),
		pipeline: {
			stages: [deliveryStage],
			statuses: ["To Do", "Done"],
			target,
		},
	};
	const observing = {
		...dependencies,
		assertBuildCommitted: async () => {
			events.push("delivery validated");

			return await Promise.resolve({
				commitSubjects: ["build commit"],
				diff: "the-diff",
				resultSha: "result-sha",
			});
		},
		captureTreatmentChecks: async (
			_targetDir: string,
			checks: readonly { readonly command: readonly string[] }[] = [],
		) => {
			events.push("checks run");
			observedCommands.push(...checks.map(({ command }) => [...command]));

			return await Promise.resolve(harnessResult("PASS", "all green"));
		},
	};

	await runGradedStages(observing, context);

	expect(events).toEqual(["delivery validated", "checks run"]);
	expect(observedCommands).toEqual([["bun", "run", "custom-check"]]);
};

const withholdsRejectedCommits = async (): Promise<void> => {
	const { dependencies, judged } = fakeStageDependencies();
	const invalid = {
		...dependencies,
		assertBuildCommitted: async () =>
			await Promise.reject(
				new StageValidationError(
					"Build phase rewrote or discarded task history",
				),
			),
	};

	await runGradedStages(invalid, await new StageContextBuilder().build());

	const [, buildInput] = judged;

	expect(buildInput?.harnessFailure).toBe(
		"Build phase rewrote or discarded task history",
	);
	expect(buildInput).not.toHaveProperty("commitSubjects");
};

const measuresRejectedCheckout = async (): Promise<void> => {
	const { dependencies, scorecardFor } = fakeStageDependencies();
	const invalid = {
		...dependencies,
		assertBuildCommitted: async () =>
			await Promise.reject(
				new StageValidationError(
					"Build phase left uncommitted changes:\n?? GLOSSARY.md",
				),
			),
		captureTreatmentChecks: async () =>
			await Promise.resolve(harnessResult("FAIL", "one test red")),
		runStageJudge: async (
			_execution: StageJudgeExecution,
			{ input }: StageJudgment,
		) =>
			await Promise.resolve(
				scorecardFor(
					input,
					input.harnessFailure === undefined ? "CONTINUE" : "STOP",
				),
			),
	};
	const context = {
		...(await new StageContextBuilder().build()),
		minimumStageGrade: "F" as const,
	};

	const outcome = await runGradedStages(invalid, context);

	expect(outcome.buildEvidence).toEqual({
		changedPaths: ["src/example.ts"],
		checkIntegrity: harnessResult("PASS", "checks match"),
		diff: "candidate-diff",
		localChecks: harnessResult("FAIL", "one test red"),
		resultSha: "snapshot-sha",
		taskState: "the task card",
	});
};

const checksOnlyDelivery = async (): Promise<void> => {
	const { dependencies } = fakeStageDependencies();
	let checkRuns = 0;
	const counting = {
		...dependencies,
		captureTreatmentChecks: async () => {
			checkRuns += CHECK_INVOCATION_COUNT_INCREMENT;

			return await Promise.resolve(harnessResult("PASS", "all green"));
		},
	};

	await runGradedStages(counting, await new StageContextBuilder().build());

	expect(checkRuns).toBe(expectedCheckRuns);
};
describe("runGradedStages delivery checks", () => {
	it(
		"runs the pipeline target checks after delivery validation",
		checksAfterValidation,
	);

	it(
		"withholds commit subjects when delivery validation fails",
		withholdsRejectedCommits,
	);

	it(
		"measures the checkout a rejected delivery left when the run continues past it",
		measuresRejectedCheckout,
	);

	it(
		"runs the target's checks for the delivery stage alone",
		checksOnlyDelivery,
	);
});
