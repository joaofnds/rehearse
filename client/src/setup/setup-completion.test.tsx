import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { focusManager } from "@tanstack/react-query";
import { fireEvent, screen, within } from "@testing-library/react";

import type { FakeServer, Reply } from "#client/test-support/fetch-stub";
import LiveReply from "#client/test-support/live-reply";
import { renderAppAt, settingsReading } from "#client/test-support/render-app";

import {
	MISSING_HINT,
	chooseLimit,
	finishSetupButton,
	originalFetch,
	scan,
	serveFreshInstall,
	servingCeilingWrite,
	setupSteps,
} from "./setup-test-fixtures";

let completionServer: FakeServer | null = null;

let completionRouter: ReturnType<typeof renderAppAt> | null = null;

afterEach(() => {
	globalThis.fetch = originalFetch;
	focusManager.setFocused(undefined);
});

describe("first-run setup", () => {
	describe("Finish setup", () => {
		it(
			"is disabled, naming what is missing, until a scan is satisfied",
			isDisabledNamingWhatIsMissingUntilAScanIsSatisfied,
		);

		it(
			"stays disabled after a scan while the limit is not a positive amount, asking only for the limit",
			staysDisabledAfterAScanWhileTheLimitIsNotAPositiveAmountAskingOnlyForTheLimit,
		);

		it(
			"asks only for a scan once a limit is chosen",
			asksOnlyForAScanOnceALimitIsChosen,
		);

		describe("from Settings with a chosen limit and satisfied scan", () => {
			beforeEach(preparesSettingsCompletion);
			it(
				"stores the chosen limit and lands on run history's empty state",
				storesTheChosenLimitAndLandsOnRunHistorySEmptyState,
			);
		});

		it(
			"marks run history as the current page once setup finishes",
			marksRunHistoryAsTheCurrentPageOnceSetupFinishes,
		);

		it(
			"shows the server's refusal of the limit and stays on setup",
			showsTheServerSRefusalOfTheLimitAndStaysOnSetup,
		);

		it(
			"shows a refused settings read during setup and stays on setup",
			showsARefusedSettingsReadDuringSetupAndStaysOnSetup,
		);
	});
});

async function showsARefusedSettingsReadDuringSetupAndStaysOnSetup(): Promise<void> {
	let settingsReply: Reply = {
		body: settingsReading(null),
		status: 200,
	};
	serveFreshInstall(
		new Map<string, Reply | LiveReply>([
			["GET /api/settings", new LiveReply(() => settingsReply)],
		]),
	);
	renderAppAt("/");
	await setupSteps();

	settingsReply = {
		body: { error: "The settings file is unreadable" },
		status: 409,
	};
	focusManager.setFocused(false);
	focusManager.setFocused(true);

	expect(await screen.findByRole("alert")).toHaveTextContent(
		"The settings file is unreadable",
	);
	expect(
		screen.getByRole("heading", { name: "Nothing is measured yet" }),
	).toBeInTheDocument();
}

async function isDisabledNamingWhatIsMissingUntilAScanIsSatisfied(): Promise<void> {
	const savedCeilingUsd = 5;

	servingCeilingWrite({
		body: settingsReading(savedCeilingUsd),
		status: 200,
	});

	renderAppAt("/");
	await setupSteps();

	expect(finishSetupButton()).toBeDisabled();
	expect(screen.getByText(MISSING_HINT)).toBeInTheDocument();
}

async function staysDisabledAfterAScanWhileTheLimitIsNotAPositiveAmountAskingOnlyForTheLimit(): Promise<void> {
	const savedCeilingUsd = 5;

	servingCeilingWrite({
		body: settingsReading(savedCeilingUsd),
		status: 200,
	});
	renderAppAt("/");
	await setupSteps();

	scan();
	await screen.findByText(/^Found 2 files/u);
	fireEvent.change(
		screen.getByRole("textbox", { name: "Spend limit in US dollars" }),
		{ target: { value: "" } },
	);

	expect(finishSetupButton()).toBeDisabled();
	expect(screen.getByText("Set a spend limit.")).toBeInTheDocument();
}

async function asksOnlyForAScanOnceALimitIsChosen(): Promise<void> {
	const savedCeilingUsd = 5;

	servingCeilingWrite({
		body: settingsReading(savedCeilingUsd),
		status: 200,
	});
	renderAppAt("/");
	await setupSteps();

	chooseLimit();

	expect(finishSetupButton()).toBeDisabled();
	expect(screen.getByText("Scan a corpus directory.")).toBeInTheDocument();
}

async function preparesSettingsCompletion(): Promise<void> {
	const savedCeilingUsd = 5;
	completionServer = servingCeilingWrite({
		body: settingsReading(savedCeilingUsd),
		status: 200,
	});
	completionRouter = renderAppAt("/settings");
	await setupSteps();
	fireEvent.click(screen.getByRole("button", { name: "$5.00" }));
	scan();
	await screen.findByText(/^Found 2 files/u);
}

async function storesTheChosenLimitAndLandsOnRunHistorySEmptyState(): Promise<void> {
	if (completionServer === null || completionRouter === null) {
		throw new Error("Settings completion setup did not run");
	}
	fireEvent.click(finishSetupButton());
	expect(await screen.findByText("No runs recorded")).toBeInTheDocument();
	expect(
		screen.getByText("0 readable entries · 0 records · 0 launches"),
	).toBeInTheDocument();
	expect(completionRouter.state.location.pathname).toBe("/");
	expect(
		completionServer.sent
			.filter(({ pathname }) => pathname === "/api/settings/spend-ceiling")
			.map(({ method, body }) => [method, body]),
	).toEqual([["PUT", JSON.stringify({ usd: 5 })]]);
}

async function marksRunHistoryAsTheCurrentPageOnceSetupFinishes(): Promise<void> {
	const savedCeilingUsd = 5;

	servingCeilingWrite({
		body: settingsReading(savedCeilingUsd),
		status: 200,
	});
	renderAppAt("/");
	await setupSteps();

	chooseLimit();
	scan();
	await screen.findByText(/^Found 2 files/u);

	fireEvent.click(finishSetupButton());
	await screen.findByText("No runs recorded");

	expect(
		within(screen.getByRole("navigation", { name: "Sections" })).getByRole(
			"link",
			{ name: /^Runs/u },
		),
	).toHaveAttribute("aria-current", "page");
}

async function showsTheServerSRefusalOfTheLimitAndStaysOnSetup(): Promise<void> {
	servingCeilingWrite({
		body: { error: "The settings file is unreadable" },
		status: 409,
	});
	renderAppAt("/");
	await setupSteps();

	chooseLimit();
	scan();
	await screen.findByText(/^Found 2 files/u);

	fireEvent.click(finishSetupButton());

	expect(await screen.findByRole("alert")).toHaveTextContent(
		"The settings file is unreadable",
	);
	expect(
		screen.getByRole("heading", { name: "Nothing is measured yet" }),
	).toBeInTheDocument();
}
