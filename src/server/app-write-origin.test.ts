import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import createAppServer from "#server/app";
import {
	LOOPBACK,
	appServer,
	clearAppRoots,
	sameOrigin,
} from "#server/app-test-fixture";

afterEach(clearAppRoots);

describe(createAppServer.name, () => {
	describe("when a request writes", () => {
		it(
			"judges a browser that sends no Sec-Fetch-Site on the rest alone",
			verifyJudgesABrowserThatSendsNoSecFetchSite,
		);

		it(
			"answers a write to a route that does not exist 404, not with the client page",
			verifyAnswersAWriteToARouteThatDoesNot,
		);

		it.each([
			["a foreign Origin", { ...sameOrigin, origin: "https://evil.example" }],
			[
				"an Origin on another port",
				{ ...sameOrigin, origin: "http://127.0.0.1:9999" },
			],
			["no Origin", { ...LOOPBACK, "content-type": "application/json" }],
			["a cross-site fetch", { ...sameOrigin, "sec-fetch-site": "cross-site" }],
			["a same-site fetch", { ...sameOrigin, "sec-fetch-site": "same-site" }],
			["a form body", { ...sameOrigin, "content-type": "text/plain" }],
			[
				"a urlencoded body",
				{
					...sameOrigin,
					"content-type": "application/x-www-form-urlencoded",
				},
			],
		])("refuses %s", async (_label, headers) => {
			const { driver } = await appServer();

			const response = await driver.writeJson({
				body: {},
				headers,
				path: "/api/no-such-route",
			});

			expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_FORBIDDEN);
		});
	});
});

async function verifyJudgesABrowserThatSendsNoSecFetchSite(): Promise<void> {
	const { driver } = await appServer();
	const { "sec-fetch-site": _fetchSite, ...withoutFetchSite } = sameOrigin;

	const response = await driver.writeJson({
		body: {},
		headers: withoutFetchSite,
		path: "/api/no-such-route",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
}

async function verifyAnswersAWriteToARouteThatDoesNot(): Promise<void> {
	const { driver } = await appServer();

	const response = await driver.writeJson({
		body: {},
		headers: sameOrigin,
		path: "/api/no-such-route",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
}
