import { join } from "node:path";

import { runConfirmation } from "./confirmation";
import type { ConfirmationRepResult } from "./confirmation-evidence";
import { startTime } from "./recorded-time";
import type { ReplayDependencies } from "./replay";
import type {
	ReplayConfirmationOutcome,
	ReplayConfirmationRequest,
} from "./replay-confirmation-contract";
import finishReplayConfirmation from "./replay-confirmation-group-record";
import runReplayRep from "./replay-confirmation-repetition";
import type { ReplayConfirmationRuntime } from "./replay-confirmation-runtime";
import { repSpendCeilings } from "./spend-ceiling";

async function runReplayConfirmationBody(
	dependencies: ReplayDependencies,
	request: ReplayConfirmationRequest,
	{ paths, frozen, worktreesDirectory, now }: ReplayConfirmationRuntime,
): Promise<ReplayConfirmationOutcome> {
	const startedAt = startTime(request.wallClock ?? Date.now);
	const makespanStart = now();
	const repSpendCeiling = repSpendCeilings({
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
			await runReplayRep(
				{
					dependencies,
					repSpendCeiling,
					request,
					runtime: { frozen, now, paths, worktreesDirectory },
				},
				plan,
			),
	);
	const makespanMs = now() - makespanStart;
	const repResults: readonly ConfirmationRepResult[] = results.map(
		({ outcome }) => {
			if (outcome.status === "rejected") {
				throw outcome.reason;
			}

			return outcome.value;
		},
	);

	const outcome = await finishReplayConfirmation(
		request,
		{ frozen, now, paths, worktreesDirectory },
		{ makespanMs, repResults, startedAt },
	);

	return outcome;
}

export { runReplayConfirmationBody as default };
