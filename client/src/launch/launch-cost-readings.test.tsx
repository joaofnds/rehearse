import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, within } from "@testing-library/react";

import { LaunchDialog } from "./launch-dialog";
import {
	SET_COMMAND,
	openDialog,
	originalFetch,
	serving,
	settingsReading,
	startButton,
} from "./launch-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(LaunchDialog.name, () => {
	it(
		"explains that storing the ceiling changes future browser and CLI launches",
		explainsThatStoringTheCeilingChangesFutureBrowserAndCLILaunches,
	);

	it(
		"states the stored ceiling holding the launch and that calls in flight can overrun it",
		statesTheStoredCeilingHoldingTheLaunchAndThatCallsInFlightCanOverrunIt,
	);

	it(
		"states a group's ceiling as the attempts times the per-run ceiling",
		statesAGroupSCeilingAsTheAttemptsTimesThePerRunCeiling,
	);

	describe("when no spend ceiling is stored", () => {
		it(
			"starts once a ceiling is entered and stored",
			startsOnceACeilingIsEnteredAndStored,
		);

		it(
			"disables start and names the command that sets one",
			disablesStartAndNamesTheCommandThatSetsOne,
		);
	});
});

async function explainsThatStoringTheCeilingChangesFutureBrowserAndCLILaunches(): Promise<void> {
	serving();
	const dialog = await openDialog({ kind: "case" });

	expect(
		within(dialog).getByText(
			"Saving changes the default for this launch and future browser launches and CLI runs.",
		),
	).toBeVisible();
	expect(
		within(dialog).getByRole("region", { name: "Saved spending default" }),
	).toHaveTextContent(
		"Start uses the saved default; this dialog has no per-launch override.",
	);
	expect(
		within(dialog).getByText(
			"Ceilings bound spending; they are not projected charges.",
		),
	).toBeVisible();
}

async function statesTheStoredCeilingHoldingTheLaunchAndThatCallsInFlightCanOverrunIt(): Promise<void> {
	serving();

	const dialog = await openDialog({ kind: "case" });

	expect(
		await within(dialog).findByText(
			"Ceiling $5.00 per attempt · stops mid-step if reached, and can be overrun by the calls in flight",
		),
	).toBeInTheDocument();
}

async function statesAGroupSCeilingAsTheAttemptsTimesThePerRunCeiling(): Promise<void> {
	serving();
	const dialog = await openDialog({ kind: "case" });

	fireEvent.click(within(dialog).getByRole("button", { name: "×6" }));

	expect(
		await within(dialog).findByText(
			"Ceiling $5.00 per attempt, $30.00 for the group of 6 · stops mid-step if reached, and can be overrun by the calls in flight",
		),
	).toBeInTheDocument();
}

async function startsOnceACeilingIsEnteredAndStored(): Promise<void> {
	serving(
		new Map([
			[
				"GET /api/settings",
				{
					body: settingsReading({ spendCeilingUsd: null }),
					status: 200,
				},
			],
			[
				"PUT /api/settings/spend-ceiling",
				{
					body: settingsReading({ spendCeilingUsd: 4 }),
					status: 200,
				},
			],
		]),
	);
	const dialog = await openDialog({ kind: "case" });
	await within(dialog).findByText(SET_COMMAND);

	fireEvent.change(
		within(dialog).getByLabelText("Default ceiling per attempt"),
		{
			target: { value: "4" },
		},
	);
	fireEvent.click(within(dialog).getByRole("button", { name: "Save default" }));

	expect(await startButton()).toBeEnabled();
}

async function disablesStartAndNamesTheCommandThatSetsOne(): Promise<void> {
	const expectedPostedCount = 0;

	const server = serving(
		new Map([
			[
				"GET /api/settings",
				{
					body: settingsReading({ spendCeilingUsd: null }),
					status: 200,
				},
			],
		]),
	);

	const dialog = await openDialog({ kind: "case" });

	expect(await within(dialog).findByText(SET_COMMAND)).toBeInTheDocument();
	expect(
		within(dialog).getByRole("button", { name: "Start · 1 attempt" }),
	).toBeDisabled();
	expect(server.posted("/api/launches")).toHaveLength(expectedPostedCount);
}
