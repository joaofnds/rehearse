import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import GroupStoppedError from "./confirmation-group-finalization-contract";
import type { ConfirmationGroupFinalization } from "./confirmation-group-finalization-contract";
import type { Immutable } from "./contracts";
import { operatorStopped } from "./operator-stop";
import type {
	ExecutedRep,
	SessionConfirmationContext,
	SessionRepExecution,
} from "./session-confirmation-execution";
import repRecord from "./session-confirmation-rep-record";
import { buildSessionAttemptRecord } from "./session-record";

const JSON_INDENTATION_SPACES = 2;

/**
 * A stopped group's reps keep only what their attempts preserved, so a kill
 * the stop caused is never recorded as a rep's provider failure.
 */
async function storeSessionReps(
	{ inputs, paths, request }: SessionConfirmationContext,
	results: Immutable<readonly SessionRepExecution[]>,
): Promise<ConfirmationGroupFinalization["repResults"]> {
	return await Array.fromAsync(results, async (result) => {
		if (await operatorStopped(paths)) {
			throw new GroupStoppedError(request.groupId);
		}

		if (result.outcome.status === "rejected") {
			throw result.outcome.reason;
		}

		return await storeRep(
			{ inputs, paths, request },
			result.plan,
			result.outcome.value,
		);
	});
}

async function storeRep(
	{
		inputs,
		paths,
		request,
	}: Pick<SessionConfirmationContext, "inputs" | "paths" | "request">,
	plan: Immutable<SessionRepExecution["plan"]>,
	executed: ExecutedRep,
): Promise<ConfirmationGroupFinalization["repResults"][number]> {
	const recordDirectory = paths.rep(plan.repId).directory;
	await mkdir(recordDirectory, { recursive: true });
	await writeAttempt({ inputs, paths, request }, executed, recordDirectory);
	const record = repRecord(
		{ inputs, plan, request },
		{
			attempt: executed.attempt,
			elapsedMs: executed.elapsedMs,
			error: executed.error,
		},
	);
	const { recordFile } = paths.rep(plan.repId);
	await Bun.write(
		recordFile,
		`${JSON.stringify(record, null, JSON_INDENTATION_SPACES)}\n`,
	);

	return { preservedWorktree: false, recordFile };
}

async function writeAttempt(
	{
		inputs,
		request,
	}: Pick<SessionConfirmationContext, "inputs" | "paths" | "request">,
	executed: ExecutedRep,
	recordDirectory: string,
): Promise<void> {
	const attemptFile = join(recordDirectory, "attempt.json");
	await Bun.write(
		attemptFile,
		`${JSON.stringify(
			buildSessionAttemptRecord({
				attempt: executed.attempt,
				corpusFiles: inputs.corpusFiles,
				corpusOrigin: inputs.corpusSnapshot.origin,
				corpusVersion: inputs.corpusVersion,
				elapsedMs: executed.elapsedMs,
				error: executed.error,
				lineage: inputs.lineage,
				sessionCase: inputs.sessionCase,
				settings: inputs.settings,
				spendCeilingUsd: request.spendCeilingUsd,
				startedAt: executed.startedAt,
				versionFiles: inputs.versionFiles,
			}),
			null,
			JSON_INDENTATION_SPACES,
		)}\n`,
	);
}
export { storeSessionReps as default };
