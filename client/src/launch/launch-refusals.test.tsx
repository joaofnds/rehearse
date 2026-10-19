import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, within } from "@testing-library/react";

import { FakeServer } from "#client/test-support/fetch-stub";

import { LaunchDialog } from "./launch-dialog";
import {
	openDialog,
	originalFetch,
	routes,
	serving,
	startButton,
} from "./launch-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(LaunchDialog.name, () => {
	describe("when a case cannot be read", () => {
		it(
			"names the case and why it is not offered",
			namesTheCaseAndWhyItIsNotOffered,
		);
	});

	describe("when the case list cannot be read", () => {
		it(
			"says so rather than offering an empty picker",
			saysSoRatherThanOfferingAnEmptyPicker,
		);
	});

	describe("when the settings file cannot be read", () => {
		it("shows the refusal the server gives", showsTheRefusalTheServerGives);
	});

	describe("when the server refuses the launch", () => {
		it(
			"shows the guard's plain-text refusal as the server sent it",
			showsTheGuardSPlainTextRefusalAsTheServerSentIt,
		);

		it(
			"keeps the dialog open and shows the refusal",
			keepsTheDialogOpenAndShowsTheRefusal,
		);
	});
});

async function namesTheCaseAndWhyItIsNotOffered(): Promise<void> {
	serving(
		new Map([
			[
				"GET /api/cases",
				{
					body: {
						cases: [],
						unreadable: [
							{
								id: "broken-case",
								reason: "Case broken-case declaration is not valid JSON",
							},
						],
					},
					status: 200,
				},
			],
		]),
	);

	const dialog = await openDialog({ kind: "case" });

	expect(
		await within(dialog).findByText(
			"broken-case: Case broken-case declaration is not valid JSON",
		),
	).toBeInTheDocument();
}

async function saysSoRatherThanOfferingAnEmptyPicker(): Promise<void> {
	serving(
		new Map([
			["GET /api/cases", { body: { error: "Cannot list cases" }, status: 500 }],
		]),
	);

	const dialog = await openDialog({ kind: "case" });

	expect(await within(dialog).findByRole("alert")).toHaveTextContent(
		"Cannot list cases",
	);
}

async function showsTheRefusalTheServerGives(): Promise<void> {
	serving(
		new Map([
			[
				"GET /api/settings",
				{ body: { error: "The settings file is not JSON" }, status: 409 },
			],
		]),
	);

	const dialog = await openDialog({ kind: "case" });

	expect(await within(dialog).findByRole("alert")).toHaveTextContent(
		/^⚠ The settings file is not JSON$/u,
	);
}

async function showsTheGuardSPlainTextRefusalAsTheServerSentIt(): Promise<void> {
	const server = new FakeServer(routes());
	server.install();
	const fakeFetch = globalThis.fetch;
	globalThis.fetch = Object.assign(
		async (input: string | URL | Request, init?: RequestInit) =>
			await (init?.method === "POST"
				? Promise.resolve(
						new Response("Forbidden: not a same-origin JSON request", {
							status: 403,
						}),
					)
				: fakeFetch(input, init)),
		{ preconnect: fetch.preconnect },
	);
	const dialog = await openDialog({ kind: "case" });

	fireEvent.click(await startButton());

	expect(await within(dialog).findByRole("alert")).toHaveTextContent(
		"Forbidden: not a same-origin JSON request",
	);
}

async function keepsTheDialogOpenAndShowsTheRefusal(): Promise<void> {
	serving(
		new Map([
			[
				"POST /api/launches",
				{
					body: { error: "Run R recorded no plan checkpoint" },
					status: 409,
				},
			],
		]),
	);
	const dialog = await openDialog({ kind: "case" });

	fireEvent.click(await startButton());

	expect(await within(dialog).findByRole("alert")).toHaveTextContent(
		"Run R recorded no plan checkpoint",
	);
}
