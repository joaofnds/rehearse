import { join } from "node:path";

import { runConfirmation } from "./confirmation";
import type { ConfirmationRepResult } from "./confirmation-evidence";
import type { PipelineConfirmationExecution } from "./pipeline-confirmation-execution";
import runPipelineRep from "./pipeline-confirmation-rep";
import type { FrozenPipelineInputs } from "./pipeline-frozen-inputs";
import type { PipelineRepPlan } from "./pipeline-rep-execution";
import { startTime } from "./recorded-time";
import { repSpendCeilings } from "./spend-ceiling";
import type { SpendCeiling } from "./spend-ceiling";

interface PipelineRepInvocation {
	readonly execution: PipelineConfirmationExecution;
	readonly frozen: FrozenPipelineInputs;
	readonly plan: PipelineRepPlan;
	readonly spendCeiling: () => SpendCeiling;
}
interface PipelineConfirmationRepResults {
	readonly startedAt: string;
	readonly makespanMs: number;
	readonly repResults: readonly ConfirmationRepResult[];
}
async function executePipelineRep({
	execution,
	frozen,
	plan,
	spendCeiling,
}: PipelineRepInvocation): Promise<ConfirmationRepResult> {
	const { dependencies, request, paths, now } = execution;
	const services = dependencies.services({
		attempt: plan.repId,
		run: request.groupId,
	});
	try {
		return await runPipelineRep(
			dependencies,
			{ frozen, paths, plan, request },
			{ now, services, spendCeiling: spendCeiling() },
		);
	} finally {
		await services.stop();
	}
}
async function executePipelineConfirmationReps(
	execution: PipelineConfirmationExecution,
	frozen: FrozenPipelineInputs,
): Promise<PipelineConfirmationRepResults> {
	const { request, worktreesDirectory, now } = execution;
	const startedAt = startTime(request.wallClock ?? Date.now);
	const makespanStart = now();
	const spendCeiling = repSpendCeilings({
		reps: request.reps,
		spendCeilingUsd: request.spendCeilingUsd,
	});

	const results = await runConfirmation(
		{
			frozenInputs: frozen,
			groupId: request.groupId,
			reps: request.reps,
			worktreePath: (repId) => join(worktreesDirectory, repId),
		},
		async (plan) =>
			await executePipelineRep({
				execution,
				frozen,
				plan,
				spendCeiling,
			}),
	);

	const makespanMs = now() - makespanStart;
	const repResults = results.map(({ outcome }) => {
		if (outcome.status === "rejected") {
			throw outcome.reason;
		}

		return outcome.value;
	});

	return { makespanMs, repResults, startedAt };
}
export { executePipelineConfirmationReps as default };
export type { PipelineConfirmationRepResults };
