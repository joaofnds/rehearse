import { describe, expect, it } from "bun:test";

import { runJudge } from "./judge";
import {
	QUOTE,
	completeGrade,
	gradeWith,
	gradedOnce,
	requirement,
	response,
	withFirstRequirement,
} from "./judge-test-fixtures";

const FIRST_JUDGE_EVIDENCE_INDEX = 0;

async function locatesDiffQuotesByFileAndHunk(): Promise<void> {
	const result = await gradedOnce(requirement("tests", "PASS"));

	const [observedFirstRequirement] = result.grade.requirements;

	expect(observedFirstRequirement?.evidence).toEqual([
		{
			claim: "tests evidence",
			locator: {
				file: "src/audit/example.ts",
				hunk: "@@ -1 +1,2 @@",
				kind: "hunk",
				occurrences: 1,
			},
			path: "src/audit/example.ts",
			quote: QUOTE,
			source: "diff",
		},
	]);
}

async function locatesBaselineQuotesByLineRange(): Promise<void> {
	const result = await gradedOnce(
		{
			evidence: [
				{
					claim: "tests are required",
					path: "CLAUDE.md",
					quote: "Write a test first.",
					source: "baseline-context",
				},
			],
			id: "tests",
			status: "PASS",
		},
		[{ content: "# Rules\n\nWrite a test first.\n", path: "CLAUDE.md" }],
	);

	const [observedFirstRequirement] = result.grade.requirements;

	expect(
		observedFirstRequirement?.evidence[FIRST_JUDGE_EVIDENCE_INDEX]?.locator,
	).toEqual({
		endLine: 3,
		file: "CLAUDE.md",
		kind: "lines",
		occurrences: 1,
		startLine: 3,
	});
}

function rejectsQuotesAbsentFromCitedSource(): void {
	const unheldQuote = withFirstRequirement(completeGrade("PASS"), {
		...requirement("tests", "PASS"),
		evidence: [
			{
				claim: "tests evidence",
				path: "src/audit/example.ts",
				quote: "export const audit = false;",
				source: "diff",
			},
		],
	});
	const rejected = {
		error:
			"Judge quoted text its cited source does not hold for tests: diff:src/audit/example.ts",
		outcome: "REJECTED",
	};

	expect(
		gradeWith(async () => await Promise.resolve(response(unheldQuote))),
	).rejects.toMatchObject({
		attempts: [{ ...rejected }, { ...rejected }],
		name: "JudgeOutputValidationError",
	});
}

async function locatesLocalChecksWithoutQuote(): Promise<void> {
	const result = await gradedOnce({
		evidence: [
			{
				claim: "the suite passes",
				path: "local-checks",
				quote: "",
				source: "local-checks",
			},
		],
		id: "tests",
		status: "PASS",
	});

	const [observedFirstRequirement] = result.grade.requirements;

	expect(observedFirstRequirement?.evidence).toEqual([
		{
			claim: "the suite passes",
			locator: { kind: "harness", recorded: true, result: "localChecks" },
			path: "local-checks",
			source: "local-checks",
		},
	]);
}

async function requestsQuotesFromDiffAndBaseline(): Promise<void> {
	const prompts: string[] = [];

	await gradeWith(async (prompt) => {
		prompts.push(prompt);

		return await Promise.resolve(response(completeGrade("PASS")));
	});

	const [observedFirstPrompt] = prompts;

	expect(observedFirstPrompt).toContain(
		"Every evidence entry must also carry quote: a span copied character for character from the cited diff or baseline context file, one to five lines, that supports the claim. Leave quote empty for local-checks.",
	);
}

describe(runJudge.name, () => {
	describe("quoted spans", () => {
		it(
			"records the file and hunk of a quote from the diff",
			locatesDiffQuotesByFileAndHunk,
		);

		it(
			"records the line range of a quote from a baseline context file",
			locatesBaselineQuotesByLineRange,
		);

		it(
			"rejects a quote its cited source does not hold",
			rejectsQuotesAbsentFromCitedSource,
		);

		it(
			"names the local checks result for an item citing local checks, with no quote",
			locatesLocalChecksWithoutQuote,
		);

		it(
			"asks the judge to quote the diff and baseline context",
			requestsQuotesFromDiffAndBaseline,
		);
	});
});
