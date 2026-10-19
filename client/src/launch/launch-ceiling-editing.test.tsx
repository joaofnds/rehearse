import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { fireEvent, waitFor, within } from "@testing-library/react";

import { LaunchDialog } from "./launch-dialog";
import {
	openDialog,
	originalFetch,
	serving,
	settingsReading,
	startButton,
	storing,
} from "./launch-test-fixtures";

let savingServer: ReturnType<typeof serving> | null = null;

let savingDialog: HTMLElement | null = null;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(LaunchDialog.name, () => {
	describe("when the spend ceiling is edited", () => {
		it(
			"shows the stored ceiling in the field to the cent",
			showsTheStoredCeilingInTheFieldToTheCent,
		);

		it(
			"shows a stored ceiling finer than a cent unrounded",
			showsAStoredCeilingFinerThanACentUnrounded,
		);

		it(
			"holds start while the field holds a ceiling not yet stored",
			holdsStartWhileTheFieldHoldsACeilingNotYetStored,
		);

		it(
			"discards an unsaved default change without writing settings and starts under the saved ceiling",
			discardsAnUnsavedDefaultChangeWithoutWritingSettingsAndStartsUnderTheSavedCeiling,
		);
		it(
			"starts with the stored ceiling retyped in another form",
			startsWithTheStoredCeilingRetypedInAnotherForm,
		);

		describe("after saving a valid default ceiling", () => {
			beforeEach(savesEnteredCeiling);
			it(
				"stores the entered ceiling as JSON and states it as the one holding the launch",
				storesTheEnteredCeilingAsJSONAndStatesItAsTheOneHoldingTheLaunch,
			);
		});

		it.each(["0", "-1", "five", "", "0x10", "1e3", " 5"])(
			"offers no store for %p",
			refusesInvalidCeiling,
		);

		it(
			"shows the refusal when the server does not store it",
			showsTheRefusalWhenTheServerDoesNotStoreIt,
		);
	});
});

async function showsTheStoredCeilingInTheFieldToTheCent(): Promise<void> {
	serving();

	const dialog = await openDialog({ kind: "case" });

	await waitFor(() => {
		expect(
			within(dialog).getByLabelText("Default ceiling per attempt"),
		).toHaveValue("5.00");
	});
}

async function showsAStoredCeilingFinerThanACentUnrounded(): Promise<void> {
	serving(
		new Map([
			[
				"GET /api/settings",
				{ body: settingsReading({ spendCeilingUsd: 0.125 }), status: 200 },
			],
		]),
	);

	const dialog = await openDialog({ kind: "case" });

	await waitFor(() => {
		expect(
			within(dialog).getByLabelText("Default ceiling per attempt"),
		).toHaveValue("0.125");
	});
}

async function holdsStartWhileTheFieldHoldsACeilingNotYetStored(): Promise<void> {
	serving();
	const dialog = await openDialog({ kind: "case" });
	await startButton();

	fireEvent.change(
		within(dialog).getByLabelText("Default ceiling per attempt"),
		{
			target: { value: "2" },
		},
	);

	expect(
		within(dialog).getByRole("button", { name: /^Start/u }),
	).toBeDisabled();
	expect(
		within(dialog).getByText(
			"Unsaved default change. Save the default or restore the saved value before starting.",
		),
	).toBeInTheDocument();
}

async function discardsAnUnsavedDefaultChangeWithoutWritingSettingsAndStartsUnderTheSavedCeiling(): Promise<void> {
	const server = serving();
	const dialog = await openDialog({ kind: "case" });
	await startButton();
	fireEvent.change(
		within(dialog).getByLabelText("Default ceiling per attempt"),
		{ target: { value: "2" } },
	);

	fireEvent.click(
		within(dialog).getByRole("button", { name: "Use saved default" }),
	);

	expect(
		within(dialog).getByLabelText("Default ceiling per attempt"),
	).toHaveValue("5.00");
	expect(server.sent.some(({ method }) => method === "PUT")).toBe(false);
	fireEvent.click(await startButton());
	await waitFor(() => {
		expect(
			JSON.parse(
				server.sent.find(({ method }) => method === "POST")?.body ?? "",
			),
		).toEqual({ attempts: 1, caseId: "audit-log", kind: "case" });
	});
}

async function startsWithTheStoredCeilingRetypedInAnotherForm(): Promise<void> {
	serving();
	const dialog = await openDialog({ kind: "case" });
	await startButton();

	fireEvent.change(
		within(dialog).getByLabelText("Default ceiling per attempt"),
		{
			target: { value: "5" },
		},
	);

	expect(within(dialog).getByRole("button", { name: /^Start/u })).toBeEnabled();
	expect(
		within(dialog).queryByText(
			"Unsaved default change. Save the default or restore the saved value before starting.",
		),
	).toBeNull();
}

async function showsTheRefusalWhenTheServerDoesNotStoreIt(): Promise<void> {
	serving(
		new Map([
			[
				"PUT /api/settings/spend-ceiling",
				{ body: { error: "The settings file is not JSON" }, status: 409 },
			],
		]),
	);
	const dialog = await openDialog({ kind: "case" });
	await startButton();

	fireEvent.change(
		within(dialog).getByLabelText("Default ceiling per attempt"),
		{
			target: { value: "3" },
		},
	);
	fireEvent.click(within(dialog).getByRole("button", { name: "Save default" }));

	expect(await within(dialog).findByRole("alert")).toHaveTextContent(
		"The settings file is not JSON",
	);
}

async function savesEnteredCeiling(): Promise<void> {
	savingServer = serving(storing({ spendCeilingUsd: 2.5 }));
	savingDialog = await openDialog({ kind: "case" });
	await startButton();
	fireEvent.change(
		within(savingDialog).getByLabelText("Default ceiling per attempt"),
		{
			target: { value: "2.50" },
		},
	);
	fireEvent.click(
		within(savingDialog).getByRole("button", { name: "Save default" }),
	);
}

async function storesTheEnteredCeilingAsJSONAndStatesItAsTheOneHoldingTheLaunch(): Promise<void> {
	if (savingServer === null || savingDialog === null) {
		throw new Error("ceiling setup did not run");
	}
	expect(
		await within(savingDialog).findByText(
			"Ceiling $2.50 per attempt · stops mid-step if reached, and can be overrun by the calls in flight",
		),
	).toBeInTheDocument();
	const request = savingServer.sent.find(({ method }) => method === "PUT");
	expect(request?.pathname).toBe("/api/settings/spend-ceiling");
	expect(request?.contentType).toBe("application/json");
	expect(JSON.parse(request?.body ?? "")).toEqual({ usd: 2.5 });
	expect(savingServer.sent.some(({ method }) => method === "POST")).toBe(false);
}

async function refusesInvalidCeiling(entered: string): Promise<void> {
	serving();
	const dialog = await openDialog({ kind: "case" });
	await startButton();

	fireEvent.change(
		within(dialog).getByLabelText("Default ceiling per attempt"),
		{
			target: { value: entered },
		},
	);

	expect(
		within(dialog).getByRole("button", { name: "Save default" }),
	).toBeDisabled();
}
