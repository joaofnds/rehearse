import { afterEach, describe, expect, it } from "bun:test";

import { focusManager } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";

import type { Reply } from "#client/test-support/fetch-stub";
import { renderAppAt, settingsReading } from "#client/test-support/render-app";

import type { ExistingInstallExample } from "./setup-test-fixtures";
import {
	EXISTING_RECORDS,
	ONE_RUN,
	RECORDED_RUN,
	originalFetch,
	serve,
} from "./setup-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
	focusManager.setFocused(undefined);
});

describe("first-run setup", () => {
	describe("when the install is not fresh", () => {
		it.each([...EXISTING_RECORDS])(
			"opens on run history for records holding $holding without a ceiling",
			opensExistingRecordHistory,
		);

		it(
			"opens on run history once a spend ceiling is stored",
			opensOnRunHistoryOnceASpendCeilingIsStored,
		);

		it(
			"opens on run history when records exist without a ceiling",
			opensOnRunHistoryWhenRecordsExistWithoutACeiling,
		);
	});
});

async function opensOnRunHistoryOnceASpendCeilingIsStored(): Promise<void> {
	const savedCeilingUsd = 20;

	serve(
		new Map<string, Reply>([
			[
				"GET /api/settings",
				{ body: settingsReading(savedCeilingUsd), status: 200 },
			],
		]),
	);

	renderAppAt("/");

	expect(
		await screen.findByRole("heading", { name: "Runs" }),
	).toBeInTheDocument();
	expect(screen.queryByText("Nothing is measured yet")).not.toBeInTheDocument();
}

async function opensOnRunHistoryWhenRecordsExistWithoutACeiling(): Promise<void> {
	serve(
		new Map<string, Reply>([
			["GET /api/settings", { body: settingsReading(null), status: 200 }],
			["GET /api/runs", { body: ONE_RUN, status: 200 }],
			["GET /api/run-listing", { body: ONE_RUN, status: 200 }],
		]),
	);

	renderAppAt("/");

	expect(await screen.findByText(RECORDED_RUN)).toBeInTheDocument();
	await waitFor(() => {
		expect(
			screen.queryByText("Nothing is measured yet"),
		).not.toBeInTheDocument();
	});
}

async function opensExistingRecordHistory({
	records,
	shows,
}: ExistingInstallExample): Promise<void> {
	serve(
		new Map<string, Reply>([
			["GET /api/settings", { body: settingsReading(null), status: 200 }],
			["GET /api/runs", { body: records, status: 200 }],
			["GET /api/run-listing", { body: records, status: 200 }],
		]),
	);

	renderAppAt("/");

	expect(await screen.findByText(shows, { exact: false })).toBeInTheDocument();
	expect(screen.queryByText("Nothing is measured yet")).not.toBeInTheDocument();
}
