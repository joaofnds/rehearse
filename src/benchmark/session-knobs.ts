import { z } from "zod";

import { STAGE_LETTER_GRADES } from "./stage-letter-grades";
import type { StageLetterGrade } from "./stage-letter-grades";

const POSITIVE_BUDGET_BOUNDARY_USD = 0;

const DEFAULT_MINIMUM_STAGE_GRADE: StageLetterGrade = "B";

const MODEL_FAMILIES = ["opus", "sonnet", "haiku"] as const;

type ModelFamily = (typeof MODEL_FAMILIES)[number];

const effortSchema = z.enum(["low", "medium", "high", "xhigh", "max"]);

type Effort = z.infer<typeof effortSchema>;

type WorkflowStage = string;

interface SessionKnobs {
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly judgeModel: string;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly minimumStageGrade?: StageLetterGrade | undefined;
}

function modelFamily(model: string): ModelFamily | undefined {
	const normalized = model.toLowerCase();
	const alias = MODEL_FAMILIES.find((family) => normalized === family);
	if (alias !== undefined) {
		return alias;
	}

	const terms = normalized.split(/[^a-z0-9]+/u);
	if (!terms.includes("claude")) {
		return undefined;
	}

	return MODEL_FAMILIES.find((family) => terms.includes(family));
}

function defaultJudgeModel(workflowModel: string): string {
	return modelFamily(workflowModel) === "opus" ? "sonnet" : "opus";
}

function judgeSelfPreferenceWarning(config: {
	readonly model: string;
	readonly judgeModel: string;
}): string | undefined {
	if (config.model === config.judgeModel) {
		return `Self-preference warning: Judge and workflow both use model ${config.model}; grades may favor the workflow output.`;
	}

	const workflowFamily = modelFamily(config.model);
	if (
		workflowFamily === undefined ||
		workflowFamily !== modelFamily(config.judgeModel)
	) {
		return undefined;
	}

	return `Self-preference warning: Judge model ${config.judgeModel} and workflow model ${config.model} are both in the ${workflowFamily} family; grades may favor the workflow output.`;
}

function parseMinimumStageGrade(text: string | undefined): StageLetterGrade {
	if (text === undefined || text === "") {
		return DEFAULT_MINIMUM_STAGE_GRADE;
	}

	const upper = text.toUpperCase();
	const grade = STAGE_LETTER_GRADES.find((letter) => letter === upper);
	if (grade === undefined) {
		throw new Error(
			`Minimum grade must be one of ${STAGE_LETTER_GRADES.join(", ")}`,
		);
	}

	return grade;
}

interface DeclaredSessionKnobs {
	readonly model?: string | undefined;
	readonly sessionBudgetUsd?: number | undefined;
}

interface RequiredSessionSettings {
	readonly model: string;
	readonly sessionBudgetUsd: number;
}

function requiredSessionSettings(
	values: ReadonlyMap<string, string>,
	env: Readonly<Record<string, string | undefined>>,
	declared: DeclaredSessionKnobs,
): RequiredSessionSettings {
	const modelText = values.get("--model") ?? env["BENCHMARK_MODEL"];
	const model =
		modelText === undefined || modelText === "" ? declared.model : modelText;
	const budgetText =
		values.get("--session-budget-usd") ?? env["BENCHMARK_SESSION_BUDGET_USD"];
	const sessionBudgetUsd =
		budgetText === undefined || budgetText === ""
			? declared.sessionBudgetUsd
			: Number(budgetText);

	if (model === undefined || sessionBudgetUsd === undefined) {
		const missing = [
			model === undefined ? "--model or BENCHMARK_MODEL" : undefined,
			sessionBudgetUsd === undefined
				? "--session-budget-usd or BENCHMARK_SESSION_BUDGET_USD"
				: undefined,
		].filter((flag) => flag !== undefined);

		throw new Error(`Provide ${missing.join(" and ")}`);
	}

	if (
		!Number.isFinite(sessionBudgetUsd) ||
		sessionBudgetUsd <= POSITIVE_BUDGET_BOUNDARY_USD
	) {
		throw new Error("Session budget must be a positive number");
	}

	return { model, sessionBudgetUsd };
}

function parseSessionKnobs(
	values: ReadonlyMap<string, string>,
	env: Readonly<Record<string, string | undefined>>,
	declared: DeclaredSessionKnobs = {},
): SessionKnobs {
	const { model, sessionBudgetUsd } = requiredSessionSettings(
		values,
		env,
		declared,
	);
	const judgeModel =
		values.get("--judge-model") ??
		env["BENCHMARK_JUDGE_MODEL"] ??
		defaultJudgeModel(model);
	const effort = parseEffort({
		role: "workflow",
		value: values.get("--effort") ?? env["BENCHMARK_EFFORT"],
	});
	const judgeEffort = parseEffort({
		role: "Judge",
		value:
			values.get("--judge-effort") ?? env["BENCHMARK_JUDGE_EFFORT"] ?? effort,
	});
	const minimumStageGrade = parseMinimumStageGrade(
		values.get("--minimum-grade") ?? env["BENCHMARK_MINIMUM_GRADE"],
	);

	return {
		effort,
		judgeEffort,
		judgeModel,
		minimumStageGrade,
		model,
		sessionBudgetUsd,
	};
}

interface EffortSelection {
	readonly role: string;
	readonly value: string | undefined;
}

function parseEffort({ role, value }: EffortSelection): Effort | undefined {
	if (value === undefined) {
		return undefined;
	}

	const parsed = effortSchema.safeParse(value);
	if (!parsed.success) {
		throw new Error(
			`Unsupported effort for ${role}: ${value}. Use low, medium, high, xhigh, or max`,
		);
	}

	return parsed.data;
}

export {
	DEFAULT_MINIMUM_STAGE_GRADE,
	effortSchema,
	judgeSelfPreferenceWarning,
	parseSessionKnobs,
	parseEffort,
};
export type { Effort, WorkflowStage, SessionKnobs, DeclaredSessionKnobs };
