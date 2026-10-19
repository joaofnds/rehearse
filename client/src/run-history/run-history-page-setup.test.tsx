import { describe, expect, it } from "bun:test";

import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer, stubFetchByPath } from "#client/test-support/fetch-stub";
import { settingsReading } from "#client/test-support/render-app";

import RunHistoryPage from "./run-history-page";
import {
	registerRunHistoryTestCleanup,
	renderPage,
} from "./run-history-page-test-harness";

const SETUP_SENTENCE = "The corpus is linked and a spend limit is set.";

async function testSaysASpendLimitIsSetWhenTheSettingsHoldACeiling(): Promise<void> {
	const savedCeilingUsd = 20;

	stubFetchByPath(
		new Map<string, unknown>([
			["/api/run-listing", { launches: [], rows: [], unreadable: [] }],
			["/api/settings", settingsReading(savedCeilingUsd)],
		]),
	);

	const page = renderPage();

	expect(
		await page.findByText(SETUP_SENTENCE, { exact: false }),
	).toBeInTheDocument();
}

async function testDoesNotSayASpendLimitIsSetWhenTheSettingsHoldNone(): Promise<void> {
	stubFetchByPath(
		new Map<string, unknown>([
			["/api/run-listing", { launches: [], rows: [], unreadable: [] }],
			["/api/settings", settingsReading(null)],
		]),
	);

	const page = renderPage();
	await page.findByText("No runs recorded");

	expect(
		page.queryByText(SETUP_SENTENCE, { exact: false }),
	).not.toBeInTheDocument();
}

async function testShowsTheRefusalInsteadWhenTheSettingsCannotBeRead(): Promise<void> {
	new FakeServer(
		new Map<string, Reply>([
			[
				"GET /api/run-listing",
				{ body: { launches: [], rows: [], unreadable: [] }, status: 200 },
			],
			[
				"GET /api/settings",
				{ body: { error: "The settings file is unreadable" }, status: 409 },
			],
		]),
	).install();

	const page = renderPage();

	expect(
		await page.findByText("The settings file is unreadable", { exact: false }),
	).toBeInTheDocument();
	expect(
		page.queryByText(SETUP_SENTENCE, { exact: false }),
	).not.toBeInTheDocument();
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("the empty state's account of setup", () => {
		it(
			"says a spend limit is set when the settings hold a ceiling",
			testSaysASpendLimitIsSetWhenTheSettingsHoldACeiling,
		);

		it(
			"does not say a spend limit is set when the settings hold none",
			testDoesNotSayASpendLimitIsSetWhenTheSettingsHoldNone,
		);

		it(
			"shows the refusal instead when the settings cannot be read",
			testShowsTheRefusalInsteadWhenTheSettingsCannotBeRead,
		);
	});
});
