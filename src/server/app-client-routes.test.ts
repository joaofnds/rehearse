import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import createAppServer from "#server/app";
import { PORT, appServer, clearAppRoots } from "#server/app-test-fixture";

afterEach(clearAppRoots);

describe(createAppServer.name, () => {
	it(
		"serves a built client asset by path",
		verifyServesABuiltClientAssetByPath,
	);

	it(
		"falls back to index.html for a client-side route the router owns",
		verifyFallsBackToIndexHtmlForAClientSide,
	);

	it(
		"forbids every other site from framing the client",
		verifyForbidsEveryOtherSiteFromFramingTheClient,
	);

	describe(
		"when the Host is not the loopback address it serves on",
		registerAppClientRoutesWhenTheHostIsNotTheLoopbackAddressItServesOn,
	);
});

async function verifyServesABuiltClientAssetByPath(): Promise<void> {
	const { driver } = await appServer();

	const response = await driver.read("/assets/app.js");
	const body = await response.text();

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(body).toContain("console.log");
}

async function verifyFallsBackToIndexHtmlForAClientSide(): Promise<void> {
	const { driver } = await appServer();

	const response = await driver.read("/some/router/path");
	const body = await response.text();

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(body).toContain("rehearse");
}

async function verifyForbidsEveryOtherSiteFromFramingTheClient(): Promise<void> {
	const { driver } = await appServer();

	const response = await driver.read("/");

	expect(response.headers.get("x-frame-options")).toBe("DENY");
	expect(response.headers.get("content-security-policy")).toBe(
		"frame-ancestors 'none'",
	);
}

async function verifyServesLocalhostOnTheSamePort(): Promise<void> {
	const { driver } = await appServer();

	const response = await driver.read("/api/runs", {
		host: `localhost:${String(PORT)}`,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
}

function registerAppClientRoutesWhenTheHostIsNotTheLoopbackAddressItServesOn(): void {
	it.each([
		["a rebound DNS name", `rebound.example:${String(PORT)}`],
		["another port", "127.0.0.1:9999"],
		["no port", "localhost"],
	])("refuses a GET from %s", async (_label, host) => {
		const { driver } = await appServer();

		const response = await driver.read("/api/runs", { host });

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_FORBIDDEN);
	});

	it("serves localhost on the same port", verifyServesLocalhostOnTheSamePort);
}
