import { afterEach, describe, expect, it } from "bun:test";

import { focusManager } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { renderAppAt } from "#client/test-support/render-app";

import {
	chooseLimit,
	originalFetch,
	serveFreshInstall,
	setupSteps,
} from "./setup-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
	focusManager.setFocused(undefined);
});

describe("first-run setup", () => {
	it(
		"opens a fresh install on the three setup steps",
		opensAFreshInstallOnTheThreeSetupSteps,
	);

	it(
		"shows setup on any screen while the install is fresh",
		showsSetupOnAnyScreenWhileTheInstallIsFresh,
	);

	it.each(["/", "/settings"])(
		"marks no section as the current page while setup shows on %s",
		async (path) => {
			serveFreshInstall();

			renderAppAt(path);
			await setupSteps();

			const sections = screen.getByRole("navigation", { name: "Sections" });
			expect(
				within(sections)
					.getAllByRole("link")
					.filter((link) => link.hasAttribute("aria-current"))
					.map((link) => link.textContent),
			).toEqual([]);
		},
	);

	it(
		"moves to a section's address and keeps setup when its link is clicked",
		movesToASectionSAddressAndKeepsSetupWhenItsLinkIsClicked,
	);

	describe("the corpus step before a scan", () => {
		it(
			"reads Required while the limit is a positive amount",
			readsRequiredWhileTheLimitIsAPositiveAmount,
		);

		it(
			"keeps the corpus required and available while the limit is not a positive amount",
			keepsTheCorpusRequiredAndAvailableWhileTheLimitIsNotAPositiveAmount,
		);
	});
});

async function opensAFreshInstallOnTheThreeSetupSteps(): Promise<void> {
	serveFreshInstall();

	renderAppAt("/");
	const steps = await setupSteps();

	expect(
		screen.getByText(/Scan an instruction corpus to unlock case declaration/u),
	).toBeInTheDocument();
	expect(
		steps.map(
			(step) => within(step).getByRole("heading", { level: 2 }).textContent,
		),
	).toEqual([
		"Set a spend limit",
		"Point at an instruction corpus",
		"Declare your first case",
	]);
	const [observedFirstStep, , observedThirdStep] = steps;

	expect(observedFirstStep).toHaveTextContent("Required");
	expect(observedThirdStep).toHaveTextContent("Locked");
	expect(observedThirdStep).toHaveClass("border-dashed");
}

async function showsSetupOnAnyScreenWhileTheInstallIsFresh(): Promise<void> {
	const expectedSetupStepCount = 3;

	serveFreshInstall();

	renderAppAt("/settings");

	expect(await setupSteps()).toHaveLength(expectedSetupStepCount);
	expect(
		screen.queryByRole("heading", { name: "Settings" }),
	).not.toBeInTheDocument();
}

async function movesToASectionSAddressAndKeepsSetupWhenItsLinkIsClicked(): Promise<void> {
	serveFreshInstall();
	const router = renderAppAt("/");
	await setupSteps();
	const sections = screen.getByRole("navigation", { name: "Sections" });

	fireEvent.click(within(sections).getByRole("link", { name: /^Settings/u }));

	await waitFor(() => {
		expect(router.state.location.pathname).toBe("/settings");
	});
	expect(
		screen.getByRole("heading", { name: "Nothing is measured yet" }),
	).toBeInTheDocument();
}

async function readsRequiredWhileTheLimitIsAPositiveAmount(): Promise<void> {
	serveFreshInstall();

	renderAppAt("/");
	const steps = await setupSteps();

	chooseLimit();
	const [, observedSecondStep] = steps;

	expect(observedSecondStep).toHaveTextContent("Required");
}

async function keepsTheCorpusRequiredAndAvailableWhileTheLimitIsNotAPositiveAmount(): Promise<void> {
	serveFreshInstall();
	renderAppAt("/");
	const steps = await setupSteps();

	fireEvent.change(
		screen.getByRole("textbox", { name: "Spend limit in US dollars" }),
		{ target: { value: "0" } },
	);

	const [, observedSecondStep] = steps;

	expect(observedSecondStep).toHaveTextContent("Required");
	expect(screen.getByRole("button", { name: "Scan" })).toBeEnabled();
}
