import type { ClaudeCallMetrics, ContextFile, JudgeGrade } from "./contracts";
import { runJudge } from "./judge";
import type { JudgeInvoker } from "./judge-attempt";
import { createSpendCeiling } from "./spend-ceiling";
import type { SpendCeiling } from "./spend-ceiling";
import { harnessResult } from "./test-support";

const OMITTED_INITIAL_REQUIREMENT_COUNT = 1;

const ORDINAL_BASE = 1;

function response(grade: JudgeGrade): string {
	return JSON.stringify({
		session_id: "judge-session",
		structured_output: grade,
		total_cost_usd: 0.1,
	});
}

const DIFF = [
	"--- a/src/audit/example.ts",
	"+++ b/src/audit/example.ts",
	"@@ -1 +1,2 @@",
	" export {};",
	"+export const audit = true;",
].join("\n");

const QUOTE = "export const audit = true;";

const RUBRIC_IDS = [
	"tests",
	"worker",
	"check-integrity",
	"local-checks",
] as const;

function requirement(
	id: string,
	status: "PASS" | "FAIL",
): JudgeGrade["requirements"][number] {
	return {
		evidence: [
			{
				claim: `${id} evidence`,
				path: "src/audit/example.ts",
				quote: QUOTE,
				source: "diff",
			},
		],
		id,
		status,
	};
}

function completeGrade(verdict: "PASS" | "FAIL"): JudgeGrade {
	return {
		requirements: RUBRIC_IDS.map((id) => requirement(id, verdict)),
		summary: "complete",
		verdict,
	};
}

function withFirstRequirement(
	grade: JudgeGrade,
	first: JudgeGrade["requirements"][number],
): JudgeGrade {
	return {
		...grade,
		requirements: [
			first,
			...grade.requirements.slice(OMITTED_INITIAL_REQUIREMENT_COUNT),
		],
	};
}

const rubric = RUBRIC_IDS.map(
	(id, index) => `${index + ORDINAL_BASE}. \`${id}\`: ${id} requirement.`,
).join("\n");

const passingChecks = harnessResult("PASS", "passes");

async function gradeWith(
	invoke: JudgeInvoker,
	baselineContext: readonly ContextFile[] = [],
	spendCeiling: SpendCeiling = createSpendCeiling({ ceilingUsd: 100 }),
): ReturnType<typeof runJudge> {
	return await runJudge(
		{
			budget: { sessionBudgetUsd: 5, spendCeiling },
			effort: undefined,
			model: "sonnet",
		},
		{
			baselineContext,
			changedPaths: ["src/audit/example.ts"],
			checkIntegrity: passingChecks,
			diff: DIFF,
			localChecks: passingChecks,
			rubric,
		},
		invoke,
	);
}

async function gradedOnce(
	first: JudgeGrade["requirements"][number],
	baselineContext: readonly ContextFile[] = [],
): ReturnType<typeof runJudge> {
	return await gradeWith(async () => {
		const grade = withFirstRequirement(completeGrade("PASS"), first);
		return await Promise.resolve(response(grade));
	}, baselineContext);
}

function unavailableEvidenceGrade(path = "src/missing.ts"): JudgeGrade {
	return withFirstRequirement(completeGrade("PASS"), {
		...requirement("tests", "PASS"),
		evidence: [
			{ claim: "unavailable evidence", path, quote: QUOTE, source: "diff" },
		],
	});
}

function meteredResponse(
	grade: JudgeGrade,
	metrics: ClaudeCallMetrics,
): string {
	return JSON.stringify({
		num_turns: metrics.turns,
		session_id: "judge-session",
		structured_output: grade,
		total_cost_usd: metrics.costUsd,
		usage: {
			cache_creation_input_tokens: metrics.cacheWriteTokens,
			cache_read_input_tokens: metrics.cacheReadTokens,
			input_tokens: metrics.inputTokens,
			output_tokens: metrics.outputTokens,
		},
	});
}

export {
	unavailableEvidenceGrade,
	meteredResponse,
	response,
	DIFF,
	QUOTE,
	RUBRIC_IDS,
	requirement,
	completeGrade,
	withFirstRequirement,
	passingChecks,
	gradeWith,
	gradedOnce,
};
