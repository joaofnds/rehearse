import type { StageJudgeInput, StageRubric } from "./contracts";
import type { StageEvidenceOrigin } from "./judge-evidence";
import { finalJudgeEvidence, stageJudgeEvidence } from "./judge-evidence";
import {
	FINAL_JUDGE_TEMPLATE,
	STAGE_JUDGE_TEMPLATE,
	renderJudgeTemplate,
} from "./judge-prompt-templates";
import type { JudgeCandidateEvidence } from "./judge-response";

interface StageJudgment {
	readonly evidenceOrigin?: StageEvidenceOrigin | undefined;
	readonly input: StageJudgeInput;
	readonly source: {
		readonly rubricPath: string;
		readonly content: string;
		readonly rubric: StageRubric;
	};
}

interface JudgePromptCandidate extends JudgeCandidateEvidence {
	readonly rubric: string;
}

function finalJudgePrompt({
	rubric,
	baselineContext,
	checkIntegrity,
	diff,
	localChecks,
}: JudgePromptCandidate): string {
	const evidence = finalJudgeEvidence({
		baselineContext,
		checkIntegrity,
		diff,
		localChecks,
	});
	const prompt = renderJudgeTemplate(FINAL_JUDGE_TEMPLATE, {
		evidence,
		rubric,
	});

	return prompt;
}

function stageJudgePrompt({
	input,
	source,
	evidenceOrigin,
}: StageJudgment): string {
	const evidence = stageJudgeEvidence(input, evidenceOrigin);
	const prompt = renderJudgeTemplate(STAGE_JUDGE_TEMPLATE, {
		evidence,
		rubric: source.content,
		stage: input.stage,
	});

	return prompt;
}

export { finalJudgePrompt, stageJudgePrompt };
export type { StageJudgment };
