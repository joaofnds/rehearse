import { HARNESS_RUBRIC_IDS } from "./config";
import type { JudgeGrade } from "./contracts";
import type { JudgeAttempt, JudgeBudget, JudgeInvoker } from "./judge-attempt";
import { runJudgeAttempts } from "./judge-attempt";
import { FINAL_JUDGE_CONTRACT_SHA256 } from "./judge-contract";
import withJudgeDirectory from "./judge-directory";
import type { JudgeSettings } from "./judge-invocation";
import { finalJudgeInvoker } from "./judge-invocation";
import { finalJudgePrompt } from "./judge-prompts";
import type { JudgeCandidateEvidence } from "./judge-response";
import readJudgeGrade from "./judge-response";

const EMPTY_COLLECTION_LENGTH = 0;

interface JudgeResult {
	readonly judgeContractSha256?: string | undefined;
	readonly grade: JudgeGrade;
	readonly prompt: string;
	readonly attempts: readonly JudgeAttempt[];
	readonly costUsd: number;
}

function parseRubricIds(rubric: string): string[] {
	const ids = [...rubric.matchAll(/^\d+\. `(?<id>[^`]+)`:/gmu)].map(
		(match) => match.groups?.["id"] ?? "",
	);

	if (
		ids.length === EMPTY_COLLECTION_LENGTH ||
		new Set(ids).size !== ids.length
	) {
		throw new Error("Rubric must contain unique requirement IDs");
	}

	return ids;
}

function validateRubricDefinition(rubric: string): string[] {
	const rubricIds = parseRubricIds(rubric);
	const missingHarnessIds = HARNESS_RUBRIC_IDS.filter(
		(id) => !rubricIds.includes(id),
	);

	if (missingHarnessIds.length > EMPTY_COLLECTION_LENGTH) {
		throw new Error(
			`Rubric must retain harness requirements: ${missingHarnessIds.join(", ")}`,
		);
	}

	return rubricIds;
}

interface JudgeExecution extends JudgeSettings {
	readonly budget: JudgeBudget;
}

interface JudgeCandidate extends JudgeCandidateEvidence {
	readonly rubric: string;
}

async function runJudge(
	{ model, effort, budget }: JudgeExecution,
	{
		rubric,
		baselineContext,
		diff,
		changedPaths,
		checkIntegrity,
		localChecks,
	}: JudgeCandidate,
	invoke?: JudgeInvoker,
): Promise<JudgeResult> {
	return await withJudgeDirectory("rehearse-judge-", async (judgeDirectory) => {
		const rubricIds = parseRubricIds(rubric);
		const candidate = {
			baselineContext,
			changedPaths,
			checkIntegrity,
			diff,
			localChecks,
			rubric,
		};
		const prompt = finalJudgePrompt(candidate);
		const invokeJudge =
			invoke ?? finalJudgeInvoker(judgeDirectory, { effort, model });

		const result = await runJudgeAttempts(
			prompt,
			{
				invoke: invokeJudge,
				judgeContractSha256: FINAL_JUDGE_CONTRACT_SHA256,
				validate: (envelope) => readJudgeGrade(envelope, rubricIds, candidate),
			},
			budget,
		);

		return {
			attempts: result.attempts,
			costUsd: result.costUsd,
			grade: result.value,
			judgeContractSha256: FINAL_JUDGE_CONTRACT_SHA256,
			prompt,
		};
	});
}

export { parseRubricIds, validateRubricDefinition, runJudge };
export type { JudgeResult };
