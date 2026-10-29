import type { ConfirmationConfig } from "./config";
import { unhandled } from "./contracts";
import { MAX_JUDGE_ATTEMPTS } from "./judge-attempt";
import { MODEL_PREFLIGHT_MAXIMUM_USD } from "./model-preflight";
import { groupCeilingReading } from "./spend-ceiling";

const SESSION_CASE_PROVIDER_CALL_COUNT = 1;
const STAGE_PRE_JUDGE_SESSION_COUNT = 2;
const PIPELINE_STAGE_SESSION_COUNT = 1;
const PIPELINE_FINAL_SESSION_COUNT = 1;

const ORDINAL_BASE = 1;

const USD_FRACTION_DIGITS = 2;

const BUDGET_SIGNIFICANT_DIGITS = 15;

type ConfirmationCostRequest =
	| {
			readonly mode: "stage";
			readonly reps: number;
			readonly sessionBudgetUsd: number;
			readonly spendCeilingUsd: number;
	  }
	| {
			readonly mode: "session";
			readonly reps: number;
			readonly sessionBudgetUsd: number;
			readonly spendCeilingUsd: number;
	  }
	| {
			readonly mode: "pipeline";
			readonly reps: number;
			readonly stages: number;
			readonly sessionBudgetUsd: number;
			readonly spendCeilingUsd: number;
	  };

interface ConfirmationCostProjection {
	readonly reps: number;
	readonly perRepMaximumUsd: number;
	readonly preflightMaximumUsd?: number | undefined;
	readonly totalMaximumUsd: number;
}

/**
 * A session case's rep is one provider call and a deterministic check list, so
 * its projection is reps x one session at the budget: no Judge attempts, no
 * Product Owner, nothing else to pay for.
 */
function sessionsPerRepFor(request: ConfirmationCostRequest): number {
	switch (request.mode) {
		case "session": {
			return SESSION_CASE_PROVIDER_CALL_COUNT;
		}
		case "stage": {
			return STAGE_PRE_JUDGE_SESSION_COUNT + MAX_JUDGE_ATTEMPTS;
		}
		case "pipeline": {
			return (
				(PIPELINE_STAGE_SESSION_COUNT + MAX_JUDGE_ATTEMPTS) * request.stages +
				PIPELINE_FINAL_SESSION_COUNT +
				MAX_JUDGE_ATTEMPTS
			);
		}
		default: {
			return unhandled(request, "confirmation mode");
		}
	}
}

function projectConfirmationCost(
	request: ConfirmationCostRequest,
): ConfirmationCostProjection {
	const sessionsPerRep = sessionsPerRepFor(request);
	const perRepMaximumUsd = Math.min(
		sessionsPerRep * request.sessionBudgetUsd,
		request.spendCeilingUsd,
	);
	if (request.mode === "session") {
		return {
			perRepMaximumUsd,
			preflightMaximumUsd: MODEL_PREFLIGHT_MAXIMUM_USD,
			reps: request.reps,
			totalMaximumUsd: Number(
				(
					MODEL_PREFLIGHT_MAXIMUM_USD +
					request.reps * perRepMaximumUsd
				).toPrecision(BUDGET_SIGNIFICANT_DIGITS),
			),
		};
	}

	return {
		perRepMaximumUsd,
		reps: request.reps,
		totalMaximumUsd: request.reps * perRepMaximumUsd,
	};
}

function formatProjectedCost(
	projection: ConfirmationCostProjection,
	spendCeilingUsd: number,
): string {
	const ceilingHolds = groupCeilingReading({
		reps: projection.reps,
		spendCeilingUsd,
	});
	const repBudgets = `${projection.reps} reps x $${projection.perRepMaximumUsd.toFixed(USD_FRACTION_DIGITS)}`;
	const breakdown =
		projection.preflightMaximumUsd === undefined
			? repBudgets
			: `$${projection.preflightMaximumUsd.toFixed(USD_FRACTION_DIGITS)} preflight + ${repBudgets}`;

	return `Projected budget: $${projection.totalMaximumUsd.toFixed(USD_FRACTION_DIGITS)} (${breakdown}). ${ceilingHolds}. A session stops only after the call that crosses its budget, so the charge can exceed this.`;
}

interface ConfirmationApprovalRequest {
	readonly projection: ConfirmationCostProjection;
	readonly spendCeilingUsd: number;
	readonly approved: boolean;
}

interface ConfirmationApprovalIO {
	readonly output: (message: string) => void;
	readonly prompt: (message: string) => Promise<string>;
}

async function requireConfirmationApproval(
	{ projection, spendCeilingUsd, approved }: ConfirmationApprovalRequest,
	io: ConfirmationApprovalIO,
): Promise<void> {
	io.output(formatProjectedCost(projection, spendCeilingUsd));
	if (approved) {
		return;
	}

	const response = await io.prompt("Start confirmation? [y/N] ");
	const answer = response.trim().toLowerCase();
	if (answer !== "y" && answer !== "yes") {
		throw new Error("Confirmation declined");
	}
}

interface RequestedExecution<Result> {
	readonly confirmation: ConfirmationConfig | undefined;
	readonly projectCost: (spendCeilingUsd: number) => ConfirmationCostProjection;
	readonly spendCeilingUsd: number;
	readonly approval: ConfirmationApprovalIO;
	readonly runDebug: () => Promise<Result>;
	readonly runConfirmed: (
		projection: ConfirmationCostProjection,
	) => Promise<Result>;
}

async function runRequestedExecution<Result>(
	execution: RequestedExecution<Result>,
): Promise<Result> {
	if (execution.confirmation === undefined) {
		execution.approval.output("single-rep evidence, not a score");

		return await execution.runDebug();
	}

	const projection = execution.projectCost(execution.spendCeilingUsd);
	await requireConfirmationApproval(
		{
			approved: execution.confirmation.approval !== "interactive",
			projection,
			spendCeilingUsd: execution.spendCeilingUsd,
		},
		execution.approval,
	);

	return await execution.runConfirmed(projection);
}

interface ConfirmationPlan<Inputs> {
	readonly groupId: string;
	readonly reps: number;
	readonly frozenInputs: Inputs;
	readonly worktreePath: (repId: string) => string;
}

interface ConfirmationRepPlan<Inputs> {
	readonly groupId: string;
	readonly ordinal: number;
	readonly repId: string;
	readonly worktreePath: string;
	readonly inputs: Inputs;
}

interface ConfirmationRepResult<Inputs, Result> {
	readonly plan: ConfirmationRepPlan<Inputs>;
	readonly outcome: PromiseSettledResult<Result>;
}

async function executeRep<Inputs, Result>(
	plan: ConfirmationRepPlan<Inputs>,
	execute: (plan: ConfirmationRepPlan<Inputs>) => Promise<Result>,
): Promise<ConfirmationRepResult<Inputs, Result>> {
	try {
		return {
			outcome: { status: "fulfilled", value: await execute(plan) },
			plan,
		};
	} catch (error) {
		return { outcome: { reason: error, status: "rejected" }, plan };
	}
}

async function runConfirmation<Inputs, Result>(
	confirmation: ConfirmationPlan<Inputs>,
	execute: (plan: ConfirmationRepPlan<Inputs>) => Promise<Result>,
): Promise<readonly ConfirmationRepResult<Inputs, Result>[]> {
	const plans = Array.from({ length: confirmation.reps }, (_value, index) => {
		const ordinal = index + ORDINAL_BASE;
		const repId = `${confirmation.groupId}-rep-${ordinal}`;

		return {
			groupId: confirmation.groupId,
			inputs: confirmation.frozenInputs,
			ordinal,
			repId,
			worktreePath: confirmation.worktreePath(repId),
		};
	});

	return await Promise.all(
		plans.map(async (plan) => await executeRep(plan, execute)),
	);
}

export {
	projectConfirmationCost,
	formatProjectedCost,
	requireConfirmationApproval,
	runRequestedExecution,
	runConfirmation,
};
export type {
	ConfirmationCostRequest,
	ConfirmationCostProjection,
	ConfirmationApprovalRequest,
	ConfirmationApprovalIO,
	RequestedExecution,
	ConfirmationPlan,
	ConfirmationRepPlan,
	ConfirmationRepResult,
};
