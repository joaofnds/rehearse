import { describe, expect, it } from "bun:test";

import { runStageJudge } from "./stage-grading";
import { stageJudgeInput } from "./stage-grading-test-fixtures";
import {
	judgeResponse,
	judgedOnce,
	quotedResponse,
	rubricSource,
} from "./stage-judge-test-fixtures";
import { judgeBudget } from "./test-support";

const FIRST_JUDGE_EVIDENCE_INDEX = 0;

async function locatesTaskStateQuotesByLineRange(): Promise<void> {
	const input = stageJudgeInput("shape", {
		taskState: '{\n  "status": "Done",\n  "title": "Audit log"\n}',
	});

	const scorecard = await judgedOnce(
		input,
		quotedResponse([
			{
				claim: "the task is done",
				path: "backlog/task.json",
				quote: '"status": "Done",',
				source: "task-state",
			},
		]),
	);

	const [observedFirstRequirement] = scorecard.grade.requirements;

	expect(observedFirstRequirement?.evidence).toEqual([
		{
			claim: "the task is done",
			locator: {
				endLine: 2,
				file: "backlog/task.json",
				kind: "lines",
				occurrences: 1,
				startLine: 2,
			},
			path: "backlog/task.json",
			quote: '"status": "Done",',
			source: "task-state",
		},
	]);
}

async function locatesWholeDiffQuotesByFileAndHunk(): Promise<void> {
	const input = stageJudgeInput("build", {
		changedPaths: ["src/a.ts"],
		diff: [
			"--- a/src/a.ts",
			"+++ b/src/a.ts",
			"@@ -1 +1,2 @@",
			" export {};",
			"+export const audit = true;",
		].join("\n"),
	});

	const scorecard = await judgedOnce(
		input,
		quotedResponse([
			{
				claim: "the audit flag is exported",
				path: "diff",
				quote: "export const audit = true;",
				source: "diff",
			},
		]),
	);

	const [observedFirstRequirement] = scorecard.grade.requirements;

	expect(
		observedFirstRequirement?.evidence[FIRST_JUDGE_EVIDENCE_INDEX]?.locator,
	).toEqual({
		file: "src/a.ts",
		hunk: "@@ -1 +1,2 @@",
		kind: "hunk",
		occurrences: 1,
	});
}

async function requestsQuotesExceptForHarnessSources(): Promise<void> {
	let prompt = "";

	await runStageJudge(
		{ budget: judgeBudget(), effort: undefined, model: "sonnet" },
		{ input: stageJudgeInput("shape"), source: rubricSource },
		{
			invoke: async (judgePrompt) => {
				prompt = judgePrompt;

				return await Promise.resolve(judgeResponse("backlog-seed.md"));
			},
		},
	);

	expect(prompt).toContain(
		"Every evidence entry must also carry quote: a span copied character for character from the cited source's supplied text, one to five lines, that supports the claim. Leave quote empty for check-integrity, local-checks and harness-failure.",
	);
}

async function rejectsUnheldQuotesAndRecordsRetry(): Promise<void> {
	const responses = [
		judgeResponse("backlog-seed.md", "task", "Brief"),
		judgeResponse("backlog-seed.md", "task", "Task"),
	];

	const scorecard = await runStageJudge(
		{ budget: judgeBudget(), effort: undefined, model: "sonnet" },
		{ input: stageJudgeInput("shape"), source: rubricSource },
		{
			invoke: async () => await Promise.resolve(responses.shift() ?? ""),
		},
	);

	expect(scorecard.attempts.map(({ outcome }) => outcome)).toEqual([
		"REJECTED",
		"ACCEPTED",
	]);
	const [observedFirstAttempt] = scorecard.attempts;

	const [observedFirstRequirement] = scorecard.grade.requirements;

	expect(observedFirstAttempt).toMatchObject({
		error:
			"Stage Judge quoted text its cited source does not hold for invalid-stage-delivery: task:backlog-seed.md",
	});
	expect(
		observedFirstRequirement?.evidence[FIRST_JUDGE_EVIDENCE_INDEX],
	).toMatchObject({
		locator: { file: "backlog-seed.md", kind: "lines", startLine: 1 },
		quote: "Task",
	});
}

describe(runStageJudge.name, () => {
	describe("quoted spans", () => {
		it(
			"locates a quote from the task state by its line range",
			locatesTaskStateQuotesByLineRange,
		);

		it(
			"locates a quote from a whole-source diff citation by its file and hunk",
			locatesWholeDiffQuotesByFileAndHunk,
		);

		it(
			"asks the judge to quote every source but the harness sources",
			requestsQuotesExceptForHarnessSources,
		);

		it(
			"rejects a quote its cited source does not hold and records the retry",
			rejectsUnheldQuotesAndRecordsRetry,
		);
	});
});
