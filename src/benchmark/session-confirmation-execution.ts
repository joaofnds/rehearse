import { join } from "node:path";

import { runConfirmation } from "./confirmation";
import type {
	ConfirmationRepPlan,
	ConfirmationRepResult,
} from "./confirmation";
import { startTime } from "./recorded-time";
import type { confirmationGroupPaths } from "./run-layout";
import type { SessionAttempt } from "./session-attempt";
import type {
	SessionConfirmationDependencies,
	SessionConfirmationRequest,
} from "./session-confirmation-contract";
import type { FrozenSessionInputs } from "./session-confirmation-frozen-inputs";
import SessionInvocationError from "./session-invocation-error";

interface ExecutedRep {
	readonly attempt: SessionAttempt;
	readonly error: string | undefined;
	readonly startedAt: string;
	readonly elapsedMs: number;
}

type SessionRepExecution = ConfirmationRepResult<
	FrozenSessionInputs,
	ExecutedRep
>;

interface SessionConfirmationContext {
	readonly dependencies: SessionConfirmationDependencies;
	readonly request: SessionConfirmationRequest;
	readonly inputs: FrozenSessionInputs;
	readonly paths: ReturnType<typeof confirmationGroupPaths>;
	readonly now: () => number;
	readonly wallClock: () => number;
}

async function executeSessionReps({
	dependencies,
	request,
	inputs,
	paths,
	now,
	wallClock,
}: SessionConfirmationContext): Promise<readonly SessionRepExecution[]> {
	return await runConfirmation<FrozenSessionInputs, ExecutedRep>(
		{
			frozenInputs: inputs,
			groupId: request.groupId,
			reps: request.reps,
			worktreePath: (repId) => join(paths.rep(repId).directory, "execution"),
		},
		async (plan) =>
			await executeSessionRep(
				{ dependencies, inputs, now, paths, request, wallClock },
				plan,
			),
	);
}
async function executeSessionRep(
	{
		dependencies,
		inputs,
		paths,
		request,
		now,
		wallClock,
	}: SessionConfirmationContext,
	plan: ConfirmationRepPlan<FrozenSessionInputs>,
): Promise<ExecutedRep> {
	const repStartedAt = startTime(wallClock);
	const repStart = now();
	const recordDirectory = paths.rep(plan.repId).directory;
	try {
		return {
			attempt: await dependencies.executeAttempt({
				corpusFiles: inputs.corpusFiles,
				corpusSnapshot: inputs.corpusSnapshot,
				lineage: inputs.lineage,
				ordinal: plan.ordinal,
				recordDirectory,
				repId: plan.repId,
				sessionCase: inputs.sessionCase,
				settings: inputs.settings,
				spendCeilingUsd: request.spendCeilingUsd,
			}),
			elapsedMs: now() - repStart,
			error: undefined,
			startedAt: repStartedAt,
		};
	} catch (error) {
		if (!(error instanceof SessionInvocationError)) {
			throw error;
		}

		return {
			attempt: error.attempt,
			elapsedMs: now() - repStart,
			error: error.message,
			startedAt: repStartedAt,
		};
	}
}
export { executeSessionReps as default };
export type { SessionConfirmationContext, SessionRepExecution, ExecutedRep };
