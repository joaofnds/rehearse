import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { failureOf } from "#cli/cli-test-support";
import SessionAttemptTestFiles from "#cli/session-attempt-test-files";

import { operatorStopRecord } from "./operator-stop";
import SessionAttemptsInFlight from "./session-attempts-in-flight";

const files = SessionAttemptTestFiles.forEachTest();

async function claimableStopFile(): Promise<string> {
	return join(
		await files.temporary("rehearse-in-flight-"),
		"operator-stop.json",
	);
}

const SHORT_BOUND_MS = 20;
const HUNG_AFTER_MS = 1000;

describe(SessionAttemptsInFlight.name, () => {
	it("never starts an attempt once the operator stop has closed it", async () => {
		const inFlight = new SessionAttemptsInFlight();
		let started = false;
		await inFlight.close("SIGTERM");

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

describe(SessionAttemptsInFlight.name, () => {
	describe("when an operator stop closes it", () => {
		it("records the stop in the record of an attempt still running", async () => {
			const inFlight = new SessionAttemptsInFlight();
			const stopFile = await claimableStopFile();
			const never = Promise.withResolvers<never>();
			void inFlight.track(async () => {
				await inFlight.claimRecord(stopFile);
				return await never.promise;
			});

			await inFlight.close("SIGTERM");

			expect(await Bun.file(stopFile).text()).toBe(
				operatorStopRecord("SIGTERM"),
			);
		});

		it("records the stop at once in a record claimed after it", async () => {
			const inFlight = new SessionAttemptsInFlight();
			const stopFile = await claimableStopFile();
			await inFlight.close("SIGINT");

			await inFlight.claimRecord(stopFile);

			expect(await Bun.file(stopFile).text()).toBe(
				operatorStopRecord("SIGINT"),
			);
		});
	});
});
