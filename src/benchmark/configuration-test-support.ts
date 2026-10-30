import { DEFAULT_CASE_ID } from "./config";
import type {
	CaseDefaults,
	Effort,
	parseArgs,
	parseReplayArgs,
} from "./config";

const CASE_DEFAULTS: CaseDefaults = {
	caseId: DEFAULT_CASE_ID,
	pipelinePath: "cases/audit-log/pipelines/default.json",
	targetPath: "/declared/target",
};

const CASE_DEFAULTS_WITH_SESSION_KNOBS: CaseDefaults = {
	...CASE_DEFAULTS,
	effort: "low",
	model: "declared-model",
	sessionBudgetUsd: 3,
};

interface SessionValues {
	readonly model: string;
	readonly effort: Effort | undefined;
	readonly judgeModel: string;
	readonly judgeEffort: Effort | undefined;
	readonly sessionBudgetUsd: number;
}

function sessionValues(
	config: ReturnType<typeof parseArgs> | ReturnType<typeof parseReplayArgs>,
): SessionValues {
	return {
		effort: config.effort,
		judgeEffort: config.judgeEffort,
		judgeModel: config.judgeModel,
		model: config.model,
		sessionBudgetUsd: config.sessionBudgetUsd,
	};
}

const SESSION_ARGS = [
	"--model",
	"sonnet",
	"--effort",
	"medium",
	"--session-budget-usd",
	"5",
] as const;

export {
	CASE_DEFAULTS,
	CASE_DEFAULTS_WITH_SESSION_KNOBS,
	SESSION_ARGS,
	sessionValues,
};
