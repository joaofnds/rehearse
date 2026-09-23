import type { ConfirmationConfig } from "./config";
import { unhandled } from "./contracts";
import { MAX_JUDGE_ATTEMPTS } from "./judge-attempt";
import { MODEL_PREFLIGHT_MAXIMUM_USD } from "./preflight";

export type ConfirmationCostRequest =
	| {
			readonly mode: "stage";
			readonly reps: number;
			readonly sessionBudgetUsd: number;
	  }
	| {
			readonly mode: "session";
			readonly reps: number;
			readonly sessionBudgetUsd: number;
	  }
	| {
			readonly mode: "pipeline";
			readonly reps: number;
			readonly stages: number;
			readonly sessionBudgetUsd: number;
	  };

export interface ConfirmationCostProjection {
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
			return 1;
		}
		case "stage": {
			return 2 + MAX_JUDGE_ATTEMPTS;
		}
		case "pipeline": {
			return (1 + MAX_JUDGE_ATTEMPTS) * request.stages + 1 + MAX_JUDGE_ATTEMPTS;
		}
		default: {
			return unhandled(request, "confirmation mode");
		}
	}
}

export function projectConfirmationCost(
	request: ConfirmationCostRequest,
): ConfirmationCostProjection {
	const sessionsPerRep = sessionsPerRepFor(request);
	const perRepMaximumUsd = sessionsPerRep * request.sessionBudgetUsd;
	if (request.mode === "session") {
		return {
			reps: request.reps,
			perRepMaximumUsd,
			preflightMaximumUsd: MODEL_PREFLIGHT_MAXIMUM_USD,
			totalMaximumUsd: Number(
				(
					MODEL_PREFLIGHT_MAXIMUM_USD +
					request.reps * perRepMaximumUsd
				).toPrecision(15),
			),
		};
	}

	return {
		reps: request.reps,
		perRepMaximumUsd,
		totalMaximumUsd: request.reps * perRepMaximumUsd,
	};
}

/**
 * Claude Code stops a session only after the call that crosses its
 * `--max-budget-usd`, and that call is charged in full, so the sum of the
 * budgets is not a cap. The line says so where the operator approves it.
 */
export function formatProjectedCost(
	projection: ConfirmationCostProjection,
): string {
	const reps = `${projection.reps} reps x $${projection.perRepMaximumUsd.toFixed(2)}`;
	const breakdown =
		projection.preflightMaximumUsd === undefined
			? reps
			: `$${projection.preflightMaximumUsd.toFixed(2)} preflight + ${reps}`;

	return `Projected budget: $${projection.totalMaximumUsd.toFixed(2)} (${breakdown}). A session stops only after the call that crosses its budget, so the charge can exceed this.`;
}

export interface ConfirmationApprovalIO {
	readonly output: (message: string) => void;
	readonly prompt: (message: string) => Promise<string>;
}

export async function requireConfirmationApproval(
	projection: ConfirmationCostProjection,
	approved: boolean,
	io: ConfirmationApprovalIO,
): Promise<void> {
	io.output(formatProjectedCost(projection));
	if (approved) {
		return;
	}

	const response = await io.prompt("Start confirmation? [y/N] ");
	const answer = response.trim().toLowerCase();
	if (answer !== "y" && answer !== "yes") {
		throw new Error("Confirmation declined");
	}
}

export interface RequestedExecution<Result> {
	readonly confirmation: ConfirmationConfig | undefined;
	readonly projectCost: () => ConfirmationCostProjection;
	readonly approval: ConfirmationApprovalIO;
	readonly runDebug: () => Promise<Result>;
	readonly runConfirmed: (
		projection: ConfirmationCostProjection,
	) => Promise<Result>;
}

export async function runRequestedExecution<Result>(
	execution: RequestedExecution<Result>,
): Promise<Result> {
	if (execution.confirmation === undefined) {
		execution.approval.output("single-rep evidence, not a score");

		return execution.runDebug();
	}

	const projection = execution.projectCost();
	await requireConfirmationApproval(
		projection,
		execution.confirmation.approved,
		execution.approval,
	);

	return execution.runConfirmed(projection);
}

export interface ConfirmationPlan<Inputs> {
	readonly groupId: string;
	readonly reps: number;
	readonly frozenInputs: Inputs;
	readonly worktreePath: (repId: string) => string;
}

export interface ConfirmationRepPlan<Inputs> {
	readonly groupId: string;
	readonly ordinal: number;
	readonly repId: string;
	readonly worktreePath: string;
	readonly inputs: Inputs;
}

export interface ConfirmationRepResult<Inputs, Result> {
	readonly plan: ConfirmationRepPlan<Inputs>;
	readonly outcome: PromiseSettledResult<Result>;
}

async function executeRep<Inputs, Result>(
	plan: ConfirmationRepPlan<Inputs>,
	execute: (plan: ConfirmationRepPlan<Inputs>) => Promise<Result>,
): Promise<ConfirmationRepResult<Inputs, Result>> {
	try {
		return {
			plan,
			outcome: { status: "fulfilled", value: await execute(plan) },
		};
	} catch (error) {
		return { plan, outcome: { status: "rejected", reason: error } };
	}
}

export function runConfirmation<Inputs, Result>(
	confirmation: ConfirmationPlan<Inputs>,
	execute: (plan: ConfirmationRepPlan<Inputs>) => Promise<Result>,
): Promise<readonly ConfirmationRepResult<Inputs, Result>[]> {
	const plans = Array.from({ length: confirmation.reps }, (_value, index) => {
		const ordinal = index + 1;
		const repId = `${confirmation.groupId}-rep-${ordinal}`;

		return {
			groupId: confirmation.groupId,
			ordinal,
			repId,
			worktreePath: confirmation.worktreePath(repId),
			inputs: confirmation.frozenInputs,
		};
	});

	return Promise.all(plans.map((plan) => executeRep(plan, execute)));
}
