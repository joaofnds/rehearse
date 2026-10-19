import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import DIAGNOSTIC_CASES from "#server/validation-diagnostic-cases";
import DiagnosticHarness from "#server/validation-diagnostic-test-harness";

describe("invalid request diagnostics", () => {
	const server = Promise.withResolvers<DiagnosticHarness>();
	beforeAll(async () => {
		try {
			server.resolve(await DiagnosticHarness.setup());
		} catch (error) {
			server.reject(error);
			throw error;
		}
	});
	afterAll(async () => {
		const harness = await server.promise;
		await harness.teardown();
	});

	it.each([...DIAGNOSTIC_CASES])("$path $name", async (request) => {
		const { driver, launcher } = await server.promise;

		const response = await driver.sendRaw(request);

		expect(response.status).toBe(request.status);
		expect(await response.json()).toEqual(request.expected);
		expect(launcher.launches).toEqual([]);
	});
});
