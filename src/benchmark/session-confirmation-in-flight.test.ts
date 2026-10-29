import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import { readInFlightClaim } from "./in-flight-claim";
import type { InFlightClaim } from "./in-flight-claim";
import { confirmationGroupPaths } from "./run-layout";
import { runSessionConfirmation } from "./session-confirmation";
import { confirmationRequest } from "./session-confirmation-test-fixtures";
import {
	hostileCorpus,
	resources,
} from "./session-confirmation-workspace-test-fixtures";

resources.registerCleanup();

describe(runSessionConfirmation.name, () => {
	it("claims the group for this process before resolving its corpus", async () => {
		const { root, sessionCase } = await hostileCorpus();
		const runsDirectory = join(root, "runs");
		const { directory } = confirmationGroupPaths(
			runsDirectory,
			"claimed-group",
		);
		const claims: (InFlightClaim | undefined)[] = [];

		await failureOf(
			runSessionConfirmation(
				{
					executeAttempt: async () =>
						await Promise.reject(new Error("a provider call must not happen")),
					resolveCorpus: async () => {
						claims.push(await readInFlightClaim(directory));

						return await Promise.reject(new Error("corpus unavailable"));
					},
				},
				confirmationRequest({
					groupId: "claimed-group",
					runsDirectory,
					sessionCase,
				}),
			),
		);

		expect(claims.map((claim) => claim?.pid)).toEqual([process.pid]);
	});
});
