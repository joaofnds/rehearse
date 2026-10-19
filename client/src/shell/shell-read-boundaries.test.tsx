import { afterEach, describe, expect, it } from "bun:test";

import { screen, waitFor } from "@testing-library/react";

import { FakeServer } from "#client/test-support/fetch-stub";
import { SHELL_BASELINE, renderAppAt } from "#client/test-support/render-app";

import { originalFetch } from "./shell-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("the navigation shell", () => {
	describe("on a screen that shows no staleness", () => {
		it.each([
			["/corpus", "Instruction corpus"],
			["/tasks", "Workflows"],
			["/settings", "Settings"],
		])(
			"%s asks for no run history with its staleness judged",
			requestsOnlyRunListing,
		);
	});
});

async function requestsOnlyRunListing(
	path: string,
	title: string,
): Promise<void> {
	const server = new FakeServer(
		new Map(
			[...SHELL_BASELINE].map(([route, body]) => [
				`GET ${route}`,
				{ body, status: 200 },
			]),
		),
	);
	server.install();

	renderAppAt(path);
	await screen.findByRole("heading", { name: title });
	await waitFor(() => {
		expect(server.sent.map(({ pathname }) => pathname)).toContain(
			"/api/run-listing",
		);
	});

	expect(server.sent.map(({ pathname }) => pathname)).not.toContain(
		"/api/runs",
	);
}
