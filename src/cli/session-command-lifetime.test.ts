import { describe, expect, it } from "bun:test";

import {
	commandOutcome,
	liftingRefusal,
} from "#benchmark/command-refusal-test-probe";

import { failureOf, recordOutput } from "./cli-test-support";
import SessionCommandLifetime from "./session-command-lifetime";

describe(SessionCommandLifetime.name, () => {
	it("releases the signal registration through its original unbound callback", () => {
		const unboundCalls: boolean[] = [];
		const lifetime = new SessionCommandLifetime({
			boundary: {
				stopOnSignal: () =>
					function release(this: undefined): void {
						unboundCalls.push(this === undefined);
					},
			},
			config: {},
			output: recordOutput().output,
			runsDirectory: "/unused-session-records",
		});

		lifetime.close();

		expect(unboundCalls).toEqual([true]);
	});
});

describe(SessionCommandLifetime.name, () => {
	describe("when an attempt's stop record cannot be written", () => {
		it("still refuses every command started after the stop", async () => {
			const registered: ((signal: NodeJS.Signals) => Promise<void>)[] = [];
			const lifetime = new SessionCommandLifetime({
				boundary: {
					stopOnSignal: (_cleanUp, recordStop) => {
						registered.push(recordStop);
						return () => {
							registered.length = 0;
						};
					},
				},
				config: {},
				output: recordOutput().output,
				runsDirectory: "/unused-session-records",
			});
			await lifetime.inFlight.claimRecord("/dev/null/operator-stop.json");

			const commandAfterStop = await liftingRefusal(async () => {
				await Promise.all(
					registered.map(async (recordStop) => {
						await failureOf(recordStop("SIGTERM"));
					}),
				);
				return await commandOutcome();
			});

			expect(commandAfterStop).toBe("refused");
		});
	});
});
