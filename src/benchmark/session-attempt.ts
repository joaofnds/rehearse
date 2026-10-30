import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { undeclaredProjectInstructions } from "./session-attempt-context";
import type { SessionAttempt } from "./session-attempt-contract";
import { invokeSession } from "./session-attempt-invocation";
import prepareAttempt from "./session-attempt-preparation";
import type {
	PreparedAttempt,
	SessionAttemptRequest,
} from "./session-attempt-preparation-contract";
import recordAttempt from "./session-attempt-recording";
import { removeAttemptFiles } from "./session-attempt-transcript";

async function runSessionAttempt(
	request: SessionAttemptRequest,
): Promise<SessionAttempt> {
	const { sessionCase, settings } = request;
	const temporaryDirectory = await mkdtemp(join(tmpdir(), "rehearse-attempt-"));
	const attemptDirectory = await realpath(temporaryDirectory);
	try {
		return await withSetupDirectory(
			async (setupDirectory) =>
				await executeAttempt(
					await prepareAttempt(request, {
						attemptDirectory,
						sessionCase,
						settings,
						setupDirectory,
					}),
				),
		);
	} catch (error) {
		await rm(attemptDirectory, { force: true, recursive: true });
		throw error;
	}
}

/** The merged settings hold the user's values, so the directory never outlives the attempt. */
async function withSetupDirectory<Result>(
	use: (setupDirectory: string) => Promise<Result>,
): Promise<Result> {
	const setupDirectory = await mkdtemp(join(tmpdir(), "rehearse-setup-"));
	try {
		return await use(setupDirectory);
	} finally {
		await rm(setupDirectory, { force: true, recursive: true });
	}
}

async function executeAttempt(
	execution: PreparedAttempt,
): Promise<SessionAttempt> {
	const {
		request,
		sessionCase,
		attemptDirectory,
		startingProjectFiles,
		overlay,
		slug,
		transcriptPath,
		contextEvidence,
	} = execution;

	try {
		const output = await invokeSession(execution);

		const recorded = await recordAttempt(request, attemptDirectory, {
			contextEvidence,
			installedCorpus: overlay.installed,
			output,
			setup: execution.setup.record,
			writtenTranscript: transcriptPath,
		});

		return {
			...recorded,
			startingProjectFiles: [
				...startingProjectFiles,
				...(await undeclaredProjectInstructions(
					sessionCase,
					recorded.loadedProjectInstructions ?? [],
				)),
			],
		};
	} finally {
		await removeAttemptFiles({
			attemptDirectory,
			recordDirectory: request.recordDirectory,
			slug,
			transcriptPath,
		});
	}
}

export { runSessionAttempt };
export { forkTranscript } from "./session-transcript-prefix";
export { sessionCaseArgs } from "./session-attempt-invocation";
export { default as SessionInputError } from "./session-attempt-preparation-contract";
export type {
	ClaudeRunner,
	SessionAttemptRequest,
	SessionNaming,
} from "./session-attempt-preparation-contract";
export type { SessionAttempt } from "./session-attempt-contract";
