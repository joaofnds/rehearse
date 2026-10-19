import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, waitFor, within } from "@testing-library/react";

import SettingsPage from "./settings-page";
import { LIVE_SETTINGS } from "./settings-record-test-fixtures";
import {
	STORED,
	originalFetch,
	serving,
	spendLimitCard,
} from "./settings-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(SettingsPage.name, () => {
	describe("the Spend limit card", () => {
		it(
			"leaves the limit empty while no ceiling is stored",
			leavesTheLimitEmptyWhileNoCeilingIsStored,
		);

		it("shows a stored ceiling to the cent", showsAStoredCeilingToTheCent);

		it.each([
			{ shown: "0.125", spendCeilingUsd: 0.125 },
			{ shown: "0.0000001", spendCeilingUsd: 0.0000001 },
		])(
			"shows a stored ceiling finer than a cent, %p, unrounded and storable",
			readsPreciseStoredCeiling,
		);

		it(
			"stores the entered limit and shows it as stored",
			storesTheEnteredLimitAndShowsItAsStored,
		);

		it(
			"carries the design's copy, the group ceiling and the overrun statement",
			carriesTheDesignSCopyTheGroupCeilingAndTheOverrunStatement,
		);

		describe("when the entry is not a positive amount", () => {
			it.each(["0", "abc", "1e3", "-2"])(
				"rejects the invalid limit %p",
				rejectsInvalidLimit,
			);
			it.each(["0", "abc", "1e3", "-2"])(
				"writes only the next valid amount after %p",
				writesNextValidAmount,
			);
		});

		describe("when the server refuses the limit", () => {
			it("shows the refusal", showsTheRefusal);
		});
	});
});

async function leavesTheLimitEmptyWhileNoCeilingIsStored(): Promise<void> {
	serving();

	expect(
		within(await spendLimitCard()).getByLabelText("Spend limit per run"),
	).toHaveValue("");
}

async function carriesTheDesignSCopyTheGroupCeilingAndTheOverrunStatement(): Promise<void> {
	serving();
	const spendLimit = await spendLimitCard();

	expect(
		within(spendLimit).getByText(
			"Enforced per run and per group. A run cannot start without one and stops mid-step when reached.",
		),
	).toBeInTheDocument();
	expect(within(spendLimit).getByText("USD per run")).toBeInTheDocument();
	expect(
		within(spendLimit).getByText("Group ceiling: attempts × per-run"),
	).toBeInTheDocument();
	expect(
		await within(spendLimit).findByText(LIVE_SETTINGS.overrun),
	).toBeInTheDocument();
}

async function showsTheRefusal(): Promise<void> {
	serving(
		new Map([
			[
				"PUT /api/settings/spend-ceiling",
				{
					body: { error: "The settings file is unreadable" },
					status: 409,
				},
			],
		]),
	);
	const spendLimit = await spendLimitCard();

	fireEvent.change(within(spendLimit).getByLabelText("Spend limit per run"), {
		target: { value: "3" },
	});
	fireEvent.click(
		within(spendLimit).getByRole("button", { name: "Store limit" }),
	);

	expect(
		await within(spendLimit).findByText("The settings file is unreadable"),
	).toBeInTheDocument();
}

async function showsAStoredCeilingToTheCent(): Promise<void> {
	serving(new Map([["GET /api/settings", { body: STORED, status: 200 }]]));
	const limit = within(await spendLimitCard()).getByLabelText(
		"Spend limit per run",
	);

	await waitFor(() => {
		expect(limit).toHaveValue("2.50");
	});
}

async function storesTheEnteredLimitAndShowsItAsStored(): Promise<void> {
	const server = serving(
		new Map([
			["PUT /api/settings/spend-ceiling", { body: STORED, status: 200 }],
		]),
	);
	const spendLimit = await spendLimitCard();
	const limit = within(spendLimit).getByLabelText("Spend limit per run");

	fireEvent.change(limit, { target: { value: "2.5" } });
	fireEvent.click(
		within(spendLimit).getByRole("button", { name: "Store limit" }),
	);

	await waitFor(() => {
		expect(
			server.sent
				.filter((request) => request.method === "PUT")
				.map((request) => [request.pathname, request.body]),
		).toEqual([["/api/settings/spend-ceiling", JSON.stringify({ usd: 2.5 })]]);
	});
	await waitFor(() => {
		expect(limit).toHaveValue("2.50");
	});
}

interface PreciseCeilingExample {
	readonly spendCeilingUsd: number;
	readonly shown: string;
}

async function readsPreciseStoredCeiling({
	spendCeilingUsd,
	shown,
}: PreciseCeilingExample): Promise<void> {
	serving(
		new Map([
			[
				"GET /api/settings",
				{ body: { ...LIVE_SETTINGS, spendCeilingUsd }, status: 200 },
			],
		]),
	);
	const spendLimit = await spendLimitCard();
	const limit = within(spendLimit).getByLabelText("Spend limit per run");

	await waitFor(() => {
		expect(limit).toHaveValue(shown);
	});
	expect(within(spendLimit).queryByRole("alert")).toBeNull();
}

async function rejectsInvalidLimit(entered: string): Promise<void> {
	serving();

	const spendLimit = await spendLimitCard();

	const limit = within(spendLimit).getByLabelText("Spend limit per run");

	const store = within(spendLimit).getByRole("button", {
		name: "Store limit",
	});

	fireEvent.change(limit, { target: { value: entered } });

	fireEvent.submit(store);

	expect(store).toBeDisabled();

	expect(
		within(spendLimit).getByText(
			"A spend limit is a positive amount in US dollars, such as 2.50, so this one is not stored.",
		),
	).toBeInTheDocument();
}

async function writesNextValidAmount(entered: string): Promise<void> {
	const server = serving();

	const spendLimit = await spendLimitCard();

	const limit = within(spendLimit).getByLabelText("Spend limit per run");

	const store = within(spendLimit).getByRole("button", {
		name: "Store limit",
	});

	fireEvent.change(limit, { target: { value: entered } });

	fireEvent.submit(store);

	// A store the bad entry started would be sent before this one.
	fireEvent.change(limit, { target: { value: "3" } });

	fireEvent.submit(store);

	await waitFor(() => {
		expect(
			server.sent
				.filter((request) => request.method === "PUT")
				.map((request) => request.body),
		).toEqual([JSON.stringify({ usd: 3 })]);
	});
}
