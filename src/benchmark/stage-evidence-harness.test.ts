import { describe, expect, it } from "bun:test";

import { runStageJudge } from "./stage-grading";
import { stageJudgeInput } from "./stage-grading-test-fixtures";
import {
	judgeResponse,
	judgedOnce,
	quotedResponse,
	quotedResponseFor,
	rubricSource,
} from "./stage-judge-test-fixtures";
import { harnessResult, judgeBudget } from "./test-support";

async function locatesHarnessResultsWithoutQuotes(): Promise<void> {
	const input = stageJudgeInput("build", {
		checkIntegrity: harnessResult("PASS", "check definitions match"),
	});

	const scorecard = await judgedOnce(
		input,
		quotedResponse([
			{
				claim: "checks are intact",
				path: "harness",
				quote: '{"status":"PASS"}',
				source: "check-integrity",
			},
			{
				claim: "no check results were recorded",
				path: "harness",
				quote: "",
				source: "local-checks",
			},
		]),
	);

	const [observedFirstRequirement] = scorecard.grade.requirements;

	expect(observedFirstRequirement?.evidence).toEqual([
		{
			claim: "checks are intact",
			locator: {
				kind: "harness",
				recorded: true,
				result: "checkIntegrity",
			},
			path: "harness",
			source: "check-integrity",
		},
		{
			claim: "no check results were recorded",
			locator: { kind: "harness", recorded: false, result: "localChecks" },
			path: "harness",
			source: "local-checks",
		},
	]);
}

async function marksMissingCommitHistoryAsAbsent(): Promise<void> {
	const scorecard = await judgedOnce(
		stageJudgeInput("build"),
		judgeResponse("commitSubjects", "commit-subjects", "add audit event"),
	);

	const [observedFirstRequirement] = scorecard.grade.requirements;

	expect(observedFirstRequirement?.evidence).toEqual([
		{
			claim: "grounded",
			locator: { kind: "absent" },
			path: "commitSubjects",
			source: "commit-subjects",
		},
	]);
}

async function locatesHarnessForcedBlockerEvidence(): Promise<void> {
	const scorecard = await runStageJudge(
		{ budget: judgeBudget(), effort: undefined, model: "sonnet" },
		{
			input: stageJudgeInput("build", {
				kind: "delivery",
				localChecks: harnessResult("FAIL", "unit tests exited 1"),
			}),
			source: {
				...rubricSource,
				rubric: {
					...rubricSource.rubric,
					hardBlockers: [
						...rubricSource.rubric.hardBlockers,
						{ description: "Finished", id: "unfinished-delivery" },
					],
				},
			},
		},
		{
			invoke: async () =>
				await Promise.resolve(
					quotedResponseFor(["invalid-stage-delivery", "unfinished-delivery"]),
				),
		},
	);

	expect(
		scorecard.grade.hardBlockers.find(({ id }) => id === "unfinished-delivery")
			?.evidence,
	).toEqual([
		{
			claim: "unit tests exited 1",
			locator: { kind: "harness", recorded: true, result: "localChecks" },
			path: "harness",
			source: "local-checks",
		},
	]);
}

describe(runStageJudge.name, () => {
	describe("quoted spans", () => {
		it(
			"drops the quote on a harness citation and names the harness result",
			locatesHarnessResultsWithoutQuotes,
		);

		it(
			"says a cited commit history the stage lacks is absent",
			marksMissingCommitHistoryAsAbsent,
		);

		it(
			"names the harness result on a blocker the harness failed",
			locatesHarnessForcedBlockerEvidence,
		);
	});
});
