import { z } from "zod";

import type { JudgeGrade } from "./contracts";
import type { RunArtifactBaseInputs } from "./run-artifact";
import RunArtifactBaseInputsBuilder from "./run-artifact-test-fixtures";
import { loadDefaultPipeline } from "./run-pipeline-test-fixtures";
import { AUDIT_LOG_PIPELINE_PATH } from "./test-support";

const OMITTED_INITIAL_REQUIREMENT_COUNT = 1;

const ORDINAL_BASE = 1;

const FIRST_RUBRIC_ID_INDEX = 0;

const RUBRIC_IDS = [
	"tests",
	"worker",
	"check-integrity",
	"local-checks",
] as const;

/** A diff holding the quote every scripted final judge evidence item cites. */
const JUDGED_QUOTE = "export const audit = true;";

const JUDGED_DIFF = [
	"--- a/src/audit/example.ts",
	"+++ b/src/audit/example.ts",
	"@@ -1 +1,2 @@",
	" export {};",
	`+${JUDGED_QUOTE}`,
].join("\n");

function requirement(
	id: string,
	status: "PASS" | "FAIL",
): JudgeGrade["requirements"][number] {
	return {
		evidence: [
			{
				claim: `${id} evidence`,
				path: "src/audit/example.ts",
				quote: JUDGED_QUOTE,
				source: "diff",
			},
		],
		id,
		status,
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

function completeGrade(verdict: "PASS" | "FAIL"): JudgeGrade {
	return {
		requirements: RUBRIC_IDS.map((id) => requirement(id, verdict)),
		summary: "complete",
		verdict,
	};
}

interface FinalJudgeResponses {
	readonly initial: string;
	readonly retry: string;
}
async function finalJudgeInputs(): Promise<RunArtifactBaseInputs> {
	const pipeline = await loadDefaultPipeline();
	const inputs = new RunArtifactBaseInputsBuilder()
		.withPipeline(pipeline, AUDIT_LOG_PIPELINE_PATH)
		.build();
	const rubric = RUBRIC_IDS.map(
		(id, index) => `${index + ORDINAL_BASE}. \`${id}\`: ${id} requirement.`,
	).join("\n");

	return { ...inputs, rubric, rubricIds: RUBRIC_IDS };
}
async function citedFinalJudgeInputs(): Promise<RunArtifactBaseInputs> {
	const inputs = await finalJudgeInputs();
	return {
		...inputs,
		evidence: {
			...inputs.evidence,
			changedPaths: ["src/audit/example.ts"],
			diff: JUDGED_DIFF,
		},
	};
}
function invalidFinalGrade(): JudgeGrade {
	return withFirstRequirement(completeGrade("PASS"), {
		...requirement(RUBRIC_IDS[FIRST_RUBRIC_ID_INDEX], "PASS"),
		evidence: [
			{
				claim: "unavailable evidence",
				path: "src/missing.ts",
				quote: JUDGED_QUOTE,
				source: "diff",
			},
		],
	});
}
function rejectedJudgeResponses(): FinalJudgeResponses {
	const response = JSON.stringify({
		session_id: "judge-session",
		structured_output: invalidFinalGrade(),
		total_cost_usd: 0.1,
	});
	return { initial: response, retry: response };
}
function refusedRetryResponses(): FinalJudgeResponses {
	const response = JSON.stringify({
		session_id: "judge-session",
		structured_output: { not: "a grade" },
		total_cost_usd: 0.2,
	});
	return { initial: response, retry: response };
}
function failedJudgeResponses(): FinalJudgeResponses {
	const response = JSON.stringify({
		is_error: true,
		session_id: "judge-session",
		subtype: "error_during_execution",
		total_cost_usd: 0.15,
	});
	return { initial: response, retry: response };
}
function haltedRetryResponses(): FinalJudgeResponses {
	return {
		initial: JSON.stringify({
			num_turns: 1,
			session_id: "judge-session",
			structured_output: { not: "a grade" },
			total_cost_usd: 0.1,
			usage: {
				cache_creation_input_tokens: 4,
				cache_read_input_tokens: 3,
				input_tokens: 1,
				output_tokens: 2,
			},
		}),
		retry: JSON.stringify({
			is_error: true,
			num_turns: 2,
			session_id: "judge-session",
			subtype: "error_max_budget_usd",
			total_cost_usd: 0.15,
			usage: {
				cache_creation_input_tokens: 8,
				cache_read_input_tokens: 7,
				input_tokens: 5,
				output_tokens: 6,
			},
		}),
	};
}
const judgeAttemptsSchema = z.array(z.object({ outcome: z.string() }));
const paidFinalArtifactSchema = z.object({
	ceilingStop: z.object({
		ceilingUsd: z.number(),
		spentUsd: z.number(),
	}),
	judgeAttempts: judgeAttemptsSchema,
	judgeCostUsd: z.number(),
	judgeProviderCalls: z.array(z.unknown()),
	status: z.string(),
});
type PaidFinalArtifact = z.infer<typeof paidFinalArtifactSchema>;
function parsePaidFinalArtifact(json: string): PaidFinalArtifact {
	return paidFinalArtifactSchema.parse(JSON.parse(json));
}
export {
	RUBRIC_IDS,
	JUDGED_DIFF,
	completeGrade,
	finalJudgeInputs,
	citedFinalJudgeInputs,
	rejectedJudgeResponses,
	refusedRetryResponses,
	failedJudgeResponses,
	haltedRetryResponses,
	parsePaidFinalArtifact,
};
export type { FinalJudgeResponses };

export { FINAL_JUDGE_CONTRACT_SHA256 } from "./judge-contract";
