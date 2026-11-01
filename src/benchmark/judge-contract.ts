import { createHash } from "node:crypto";

import {
	claudeJsonSchema,
	judgeGradeResponseSchema,
	stageJudgeInputSchema,
	stageJudgeResponseSchema,
} from "./contracts";
import {
	FINAL_EVIDENCE_ORDER,
	RECORDED_STAGE_EVIDENCE_ORDER,
	STAGE_EVIDENCE_ORDER,
} from "./judge-evidence";
import {
	FINAL_JUDGE_TEMPLATE,
	RETRY_JUDGE_TEMPLATE,
	STAGE_JUDGE_TEMPLATE,
} from "./judge-prompt-templates";
import {
	FINAL_JUDGE_SYSTEM_PROMPT,
	STAGE_JUDGE_SYSTEM_PROMPT,
} from "./judge-system-prompts";

interface JudgeContract {
	readonly systemPrompt: string;
	readonly promptTemplate: string;
	readonly responseSchema: string;
	readonly evidenceDefinition: string;
	readonly retryTemplate: string;
}

function judgeContractSha256(contract: JudgeContract): string {
	return createHash("sha256")
		.update(
			JSON.stringify([
				contract.systemPrompt,
				contract.promptTemplate,
				contract.responseSchema,
				contract.evidenceDefinition,
				contract.retryTemplate,
			]),
		)
		.digest("hex");
}

const FINAL_JUDGE_CONTRACT: JudgeContract = {
	evidenceDefinition: JSON.stringify(FINAL_EVIDENCE_ORDER),
	promptTemplate: FINAL_JUDGE_TEMPLATE,
	responseSchema: claudeJsonSchema(judgeGradeResponseSchema),
	retryTemplate: RETRY_JUDGE_TEMPLATE,
	systemPrompt: FINAL_JUDGE_SYSTEM_PROMPT,
};

const STAGE_JUDGE_CONTRACT: JudgeContract = {
	evidenceDefinition: JSON.stringify({
		input: claudeJsonSchema(stageJudgeInputSchema),
		record: RECORDED_STAGE_EVIDENCE_ORDER,
		session: STAGE_EVIDENCE_ORDER,
	}),
	promptTemplate: STAGE_JUDGE_TEMPLATE,
	responseSchema: claudeJsonSchema(stageJudgeResponseSchema),
	retryTemplate: RETRY_JUDGE_TEMPLATE,
	systemPrompt: STAGE_JUDGE_SYSTEM_PROMPT,
};

const FINAL_JUDGE_CONTRACT_SHA256 = judgeContractSha256(FINAL_JUDGE_CONTRACT);
const STAGE_JUDGE_CONTRACT_SHA256 = judgeContractSha256(STAGE_JUDGE_CONTRACT);

export {
	FINAL_JUDGE_CONTRACT,
	STAGE_JUDGE_CONTRACT,
	FINAL_JUDGE_CONTRACT_SHA256,
	STAGE_JUDGE_CONTRACT_SHA256,
	judgeContractSha256,
};
