import { describe, expect, it } from "bun:test";

import { operatorStopped } from "#benchmark/operator-stop";
import { sessionAttemptIds, sessionAttemptPaths } from "#benchmark/run-layout";
import SessionAttemptsInFlight from "#benchmark/session-attempts-in-flight";
import { failureOf } from "#cli/cli-test-support";
import { runSessionDebugAttempt } from "#cli/session-run-command";

import SessionAttemptTestFiles from "./session-attempt-test-files";
import SessionCorpusFixture from "./session-corpus-test-fixture";

const files = SessionAttemptTestFiles.forEachTest();

const corpora = new SessionCorpusFixture(files);

interface StoppedAttemptFiles {
	readonly stopRecorded: boolean;
	readonly attemptRecorded: boolean;
}

/** What each attempt the operator stopped during its session left on disk. */
async function stoppedAttemptFiles(): Promise<readonly StoppedAttemptFiles[]> {
	const request = await corpora.requestFor(
		await corpora.corpusDirectory("brief\n"),
	);
	const inFlight = new SessionAttemptsInFlight();

	await failureOf(
		runSessionDebugAttempt({
			...request,
			inFlight,
			runClaude: async () => {
				inFlight.close("SIGTERM");

				return await Promise.reject(new Error("claude killed"));
			},
		}),
	);
	const attempts = await sessionAttemptIds(request.runsDirectory);

	return await Promise.all(
		attempts.map(async (attempt) => {
			const paths = sessionAttemptPaths(request.runsDirectory, attempt);

			return {
				attemptRecorded: await Bun.file(paths.recordFile).exists(),
				stopRecorded: await operatorStopped(paths),
			};
		}),
	);
}

describe(runSessionDebugAttempt.name, () => {
	describe("when the operator stops it during its session", () => {
		it("records the operator stop and no attempt record", async () => {
			const attempts = await stoppedAttemptFiles();

			expect(attempts).toEqual([
				{ attemptRecorded: false, stopRecorded: true },
			]);
		});
	});
});
