import { describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";

import SessionAttemptsInFlight from "./session-attempts-in-flight";

const SHORT_BOUND_MS = 20;
const HUNG_AFTER_MS = 1000;

describe(SessionAttemptsInFlight.name, () => {
	it("never starts an attempt once the operator stop has closed it", async () => {
		const inFlight = new SessionAttemptsInFlight();
		let started = false;
		inFlight.close();

		await failureOf(
			inFlight.track(async () => {
				started = true;
				await Promise.resolve();
			}),
		);

		expect(started).toBe(false);
	});

	it("stops waiting at the bound for an attempt that never settles", async () => {
		const inFlight = new SessionAttemptsInFlight();
		const never = Promise.withResolvers<never>();
		void inFlight.track(async () => await never.promise);

		const waited = await Promise.race([
			inFlight.settled(SHORT_BOUND_MS).then(() => "bounded"),
			Bun.sleep(HUNG_AFTER_MS).then(() => "hung"),
		]);

		expect(waited).toBe("bounded");
	});
});
