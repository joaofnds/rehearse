import { describe, expect, it } from "bun:test";

import { recordOutput } from "./cli-test-support";
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
