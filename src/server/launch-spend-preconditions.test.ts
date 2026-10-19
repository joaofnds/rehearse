import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { SET_SPEND_CEILING_COMMAND } from "#benchmark/settings";

import { refusalSchema } from "./launch-http-test-fixture";
import LaunchSpendRequestFixture from "./launch-spend-request-test-fixture";
import type { LaunchRequest } from "./launches-contract";

const fixture = new LaunchSpendRequestFixture();

afterEach(async () => {
	await fixture.dispose();
});

async function refusesLaunchWithoutSpendCeiling(
	kind: LaunchRequest["kind"],
): Promise<void> {
	const { driver, request } = await fixture.prepare(kind);

	const response = await driver.post(request);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(refusalSchema.parse(await response.json()).error).toContain(
		SET_SPEND_CEILING_COMMAND,
	);
	expect(driver.launcher.launches).toEqual([]);
}

describe("POST /api/launches", () => {
	describe("when no spend ceiling is stored", () => {
		it.each(["case", "replay", "comparison", "extension", "analysis"] as const)(
			"refuses a %s launch and names how to set a ceiling",
			refusesLaunchWithoutSpendCeiling,
		);
	});
});
