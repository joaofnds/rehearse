import { describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";

import { readInFlightClaim } from "./in-flight-claim";
import type { InFlightClaim } from "./in-flight-claim";
import runReplayConfirmation from "./replay-confirmation";
import ReplayCorpusBuilder from "./replay-confirmation-corpus-test-builder";
import ReplayConfirmationFixtureBuilder from "./replay-confirmation-fixture-builder";
import { confirmationGroupPaths } from "./run-layout";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

describe(runReplayConfirmation.name, () => {
	it("claims the group for this process before measuring its corpus", async () => {
		const { harness, run } = await new ReplayConfirmationFixtureBuilder().build(
			testResources,
		);
		const corpusRoot = await new ReplayCorpusBuilder().build(testResources);
		const { dependencies, request } = harness.prepareConfirmation(
			{
				corpusRoots: [{ kind: "directory", root: corpusRoot }],
				paths: run.paths,
			},
			{},
		);
		const { directory } = confirmationGroupPaths(
			run.paths.runsDirectory,
			request.groupId,
		);
		const claims: (InFlightClaim | undefined)[] = [];

		await failureOf(
			runReplayConfirmation(
				{
					...dependencies,
					stageSession: {
						...dependencies.stageSession,
						measureCorpus: async () => {
							claims.push(await readInFlightClaim(directory));

							return await Promise.reject(new Error("corpus unavailable"));
						},
					},
				},
				request,
			),
		);

		expect(claims).toEqual([
			{ pid: process.pid, startedAt: expect.any(String) },
		]);
	});
});
