import { afterEach, describe, expect, it } from "bun:test";

import { focusManager } from "@tanstack/react-query";
import { fireEvent, screen } from "@testing-library/react";

import type { Reply } from "#client/test-support/fetch-stub";
import { renderAppAt, settingsReading } from "#client/test-support/render-app";

import {
	SCANNED_CORPUS,
	chooseLimit,
	limitInput,
	originalFetch,
	pressedPresets,
	scan,
	serveFreshInstall,
	setupSteps,
} from "./setup-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
	focusManager.setFocused(undefined);
});

describe("first-run setup", () => {
	describe("the spend limit", () => {
		it(
			"starts with no limit and no preset selected, so the step reads Required",
			startsWithNoLimitAndNoPresetSelectedSoTheStepReadsRequired,
		);

		it("reads Set once a limit is chosen", readsSetOnceALimitIsChosen);

		it(
			"takes a preset's amount when the preset is chosen",
			takesAPresetSAmountWhenThePresetIsChosen,
		);

		it(
			"selects no preset for a typed amount none of them names",
			selectsNoPresetForATypedAmountNoneOfThemNames,
		);

		it(
			"stores nothing while the limit is chosen",
			storesNothingWhileTheLimitIsChosen,
		);
	});
});

async function startsWithNoLimitAndNoPresetSelectedSoTheStepReadsRequired(): Promise<void> {
	serveFreshInstall();

	renderAppAt("/");
	const steps = await setupSteps();

	expect(limitInput()).toHaveValue("");
	expect(screen.queryAllByRole("button", { pressed: true })).toEqual([]);
	const [observedFirstStep] = steps;

	expect(observedFirstStep).toHaveTextContent("Required");
}

async function readsSetOnceALimitIsChosen(): Promise<void> {
	serveFreshInstall();
	renderAppAt("/");
	const steps = await setupSteps();

	chooseLimit();

	const [observedFirstStep] = steps;

	expect(observedFirstStep).toHaveTextContent("Set");
	expect(observedFirstStep).not.toHaveTextContent("Required");
}

async function takesAPresetSAmountWhenThePresetIsChosen(): Promise<void> {
	serveFreshInstall();
	renderAppAt("/");
	await setupSteps();

	fireEvent.click(screen.getByRole("button", { name: "$5.00" }));

	expect(limitInput()).toHaveValue("5.00");
	expect(pressedPresets()).toEqual(["$5.00"]);
}

async function selectsNoPresetForATypedAmountNoneOfThemNames(): Promise<void> {
	serveFreshInstall();
	renderAppAt("/");
	await setupSteps();

	fireEvent.change(limitInput(), { target: { value: "7.50" } });

	expect(screen.queryAllByRole("button", { pressed: true })).toEqual([]);
}

async function storesNothingWhileTheLimitIsChosen(): Promise<void> {
	const server = serveFreshInstall(
		new Map<string, Reply>([
			["PUT /api/setup/corpus", { body: settingsReading(null), status: 200 }],
			["GET /api/corpus", { body: SCANNED_CORPUS, status: 200 }],
		]),
	);
	renderAppAt("/");
	await setupSteps();

	fireEvent.click(screen.getByRole("button", { name: "$50.00" }));
	fireEvent.change(limitInput(), { target: { value: "3" } });
	// A later round trip lets any write the choice started reach the server.
	scan();
	await screen.findByText(/^Found 2 files/u);

	expect(
		server.sent.filter(
			({ pathname }) => pathname === "/api/settings/spend-ceiling",
		),
	).toEqual([]);
}
