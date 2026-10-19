import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { ConfirmationGroupFinalization } from "./confirmation-group-finalization-contract";
import type { Immutable } from "./contracts";
import type {
	ExecutedRep,
	SessionConfirmationContext,
	SessionRepExecution,
} from "./session-confirmation-execution";
import repRecord from "./session-confirmation-rep-record";
import { buildSessionAttemptRecord } from "./session-record";

const JSON_INDENTATION_SPACES = 2;

async function storeSessionReps(
	{ inputs, paths, request }: SessionConfirmationContext,
	results: Immutable<readonly SessionRepExecution[]>,
): Promise<ConfirmationGroupFinalization["repResults"]> {
	return await Array.fromAsync(results, async (result) => {
		if (result.outcome.status === "rejected") {
			throw result.outcome.reason;
		}

		const executed = result.outcome.value;
		const recordDirectory = paths.rep(result.plan.repId).directory;
		await mkdir(recordDirectory, { recursive: true });
		await writeAttempt({ inputs, paths, request }, executed, recordDirectory);
		const record = repRecord(
			{ inputs, plan: result.plan, request },
			{
				attempt: executed.attempt,
				elapsedMs: executed.elapsedMs,
				error: executed.error,
			},
		);
		const { recordFile } = paths.rep(result.plan.repId);
		await Bun.write(
			recordFile,
			`${JSON.stringify(record, null, JSON_INDENTATION_SPACES)}\n`,
		);

		return { preservedWorktree: false, recordFile };
	});
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
