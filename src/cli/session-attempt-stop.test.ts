import { describe, expect, it } from "bun:test";

import { operatorStopRecord } from "#benchmark/operator-stop";
import { sessionAttemptIds, sessionAttemptPaths } from "#benchmark/run-layout";
import SessionAttemptsInFlight from "#benchmark/session-attempts-in-flight";
import { failureOf } from "#cli/cli-test-support";
import { runSessionDebugAttempt } from "#cli/session-run-command";
import type { SessionRunRequest } from "#cli/session-run-command";

import SessionAttemptTestFiles from "./session-attempt-test-files";
import SessionCorpusFixture from "./session-corpus-test-fixture";

const files = SessionAttemptTestFiles.forEachTest();

const corpora = new SessionCorpusFixture(files);

interface StoppedAttemptFiles {
	readonly stopRecord: string | undefined;
	readonly attemptRecorded: boolean;
}

const START_INSTANT_MS = 0;

type StopPoint = (stop: () => void) => Partial<SessionRunRequest>;

/** The stop lands while claude runs, which the stop then kills. */
function duringItsSession(stop: () => void): Partial<SessionRunRequest> {
	return {
		runClaude: async () => {
			stop();

			return await Promise.reject(new Error("claude killed"));
		},
	};
}

/** The stop lands once the attempt is claimed, when it reads its start. */
function beforeItsSession(stop: () => void): Partial<SessionRunRequest> {
	return {
		now: () => {
			stop();

			return START_INSTANT_MS;
		},
	};
}

/** What each attempt the operator stopped at the given point left on disk. */
async function stoppedAttemptFiles(
	stopAt: StopPoint,
): Promise<readonly StoppedAttemptFiles[]> {
	const request = await corpora.requestFor(
		await corpora.corpusDirectory("brief\n"),
	);
	const inFlight = new SessionAttemptsInFlight();

	await failureOf(
		runSessionDebugAttempt({
			...request,
			inFlight,
			...stopAt(() => {
				inFlight.close("SIGTERM");
			}),
		}),
	);
	const attempts = await sessionAttemptIds(request.runsDirectory);

	return await Promise.all(
		attempts.map(async (attempt) => {
			const paths = sessionAttemptPaths(request.runsDirectory, attempt);

			return {
				attemptRecorded: await Bun.file(paths.recordFile).exists(),
				stopRecord: (await Bun.file(paths.operatorStopFile).exists())
					? await Bun.file(paths.operatorStopFile).text()
					: undefined,
			};
		}),
	);
}

describe(runSessionDebugAttempt.name, () => {
	describe("when the operator stops it during its session", () => {
		it("records the operator stop and no attempt record", async () => {
			const attempts = await stoppedAttemptFiles(duringItsSession);

			expect(attempts).toEqual([
				{
					attemptRecorded: false,
					stopRecord: operatorStopRecord("SIGTERM"),
				},
			]);
		});
	});

	describe("when the operator stops it before its session starts", () => {
		it("records the operator stop and no attempt record", async () => {
			const attempts = await stoppedAttemptFiles(beforeItsSession);

			expect(attempts).toEqual([
				{
					attemptRecorded: false,
					stopRecord: operatorStopRecord("SIGTERM"),
				},
			]);
		});
	});
});
