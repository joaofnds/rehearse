import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { claimInFlight, readInFlightClaim } from "./in-flight-claim";
import { TestResources } from "./test-support";

const resources = TestResources.forEachTest();

async function recordDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-in-flight-"));
	resources.track(directory);

	return join(directory, "record");
}

describe(readInFlightClaim.name, () => {
	it("reads the claim this process wrote, naming its pid and start", async () => {
		const directory = await recordDirectory();
		const before = Date.now();

		await claimInFlight(directory);
		const claim = await readInFlightClaim(directory);

		expect(claim?.pid).toBe(process.pid);
		expect(Date.parse(claim?.startedAt ?? "")).toBeGreaterThanOrEqual(before);
	});

	describe("when the directory holds no claim", () => {
		it("reads none", async () => {
			const directory = await recordDirectory();

			expect(await readInFlightClaim(directory)).toBeUndefined();
		});
	});

	describe("when the claim does not parse", () => {
		it.each(["{}", "{not json"])("reads none from %p", async (text) => {
			const directory = await recordDirectory();
			await claimInFlight(directory);
			await Bun.write(join(directory, "in-flight.json"), text);

			expect(await readInFlightClaim(directory)).toBeUndefined();
		});
	});
});
