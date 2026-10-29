import { describe, expect, it } from "bun:test";

import { CorpusConfigurationError } from "#benchmark/corpus-file";
import { readInFlightClaim } from "#benchmark/in-flight-claim";
import type { InFlightClaim } from "#benchmark/in-flight-claim";
import { sessionAttemptIds, sessionAttemptPaths } from "#benchmark/run-layout";
import { failureOf } from "#cli/cli-test-support";
import { runSessionDebugAttempt } from "#cli/session-run-command";

import SessionAttemptTestFiles from "./session-attempt-test-files";
import SessionCorpusFixture from "./session-corpus-test-fixture";

const files = SessionAttemptTestFiles.forEachTest();

const corpora = new SessionCorpusFixture(files);

async function attemptClaims(
	runsDirectory: string,
): Promise<readonly (InFlightClaim | undefined)[]> {
	const attempts = await sessionAttemptIds(runsDirectory);

	return await Promise.all(
		attempts.map(
			async (attempt) =>
				await readInFlightClaim(
					sessionAttemptPaths(runsDirectory, attempt).directory,
				),
		),
	);
}

describe(runSessionDebugAttempt.name, () => {
	it("claims the attempt for this process while its session runs", async () => {
		const request = await corpora.requestFor(
			await corpora.corpusDirectory("brief\n"),
		);
		const claims: (readonly (InFlightClaim | undefined)[])[] = [];

		await failureOf(
			runSessionDebugAttempt({
				...request,
				runClaude: async () => {
					claims.push(await attemptClaims(request.runsDirectory));

					return await Promise.reject(new Error("session unavailable"));
				},
			}),
		);

		expect(
			claims.map((attemptClaimsThen) =>
				attemptClaimsThen.map((claim) => claim?.pid),
			),
		).toEqual([[process.pid]]);
	});

	describe("when its corpus does not resolve", () => {
		it("leaves no attempt directory", async () => {
			const request = await corpora.requestFor();

			await failureOf(
				runSessionDebugAttempt({
					...request,
					resolveCorpus: async () =>
						await Promise.reject(
							new CorpusConfigurationError("invalid backing root"),
						),
				}),
			);

			expect(await sessionAttemptIds(request.runsDirectory)).toEqual([]);
		});
	});
});
