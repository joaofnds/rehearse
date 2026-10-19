import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { RunRecordStageBuilder } from "#client/test-support/run-detail";

import {
	graphNode,
	inOutAction,
	originalFetch,
	renderMonitor,
} from "./step-modal-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("/monitor step modal", () => {
	it(
		"keeps step actions in the selected-step toolbar",
		keepsStepActionsInTheSelectedStepToolbar,
	);

	it(
		"opens the stage's step modal from its in / out action",
		opensTheStageSStepModalFromItsInOutAction,
	);

	it(
		"closes on its Esc button and returns focus to the in / out action",
		closesOnItsEscButtonAndReturnsFocusToTheInOutAction,
	);

	it(
		"closes on the Esc key and returns focus to the in / out action",
		closesOnTheEscKeyAndReturnsFocusToTheInOutAction,
	);

	it("keeps focus inside while open", keepsFocusInsideWhileOpen);
});

async function keepsStepActionsInTheSelectedStepToolbar(): Promise<void> {
	const expectedButtonCount = 1;

	renderMonitor([
		new RunRecordStageBuilder({
			stage: "plan",
			status: "graded",
		}).build(),
		new RunRecordStageBuilder().build(),
	]);

	const node = await graphNode("plan");
	expect(within(node).getAllByRole("button")).toHaveLength(expectedButtonCount);
	expect(await inOutAction("plan")).toBeInTheDocument();
}

async function opensTheStageSStepModalFromItsInOutAction(): Promise<void> {
	renderMonitor([
		new RunRecordStageBuilder({
			stage: "plan",
			status: "graded",
		}).build(),
		new RunRecordStageBuilder().build(),
	]);

	fireEvent.click(await inOutAction("plan"));

	expect(await screen.findByRole("dialog", { name: /plan/u })).toHaveAttribute(
		"aria-modal",
		"true",
	);
}

async function closesOnItsEscButtonAndReturnsFocusToTheInOutAction(): Promise<void> {
	renderMonitor([
		new RunRecordStageBuilder({
			stage: "plan",
			status: "graded",
		}).build(),
		new RunRecordStageBuilder().build(),
	]);
	const action = await inOutAction("plan");
	fireEvent.click(action);
	const dialog = await screen.findByRole("dialog", { name: /plan/u });

	fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));

	await waitFor(() => {
		expect(screen.queryByRole("dialog")).toBeNull();
	});
	expect(action).toHaveFocus();
}

async function closesOnTheEscKeyAndReturnsFocusToTheInOutAction(): Promise<void> {
	renderMonitor([
		new RunRecordStageBuilder({
			stage: "plan",
			status: "graded",
		}).build(),
		new RunRecordStageBuilder().build(),
	]);
	const action = await inOutAction("plan");
	fireEvent.click(action);
	const dialog = await screen.findByRole("dialog", { name: /plan/u });

	fireEvent.keyDown(dialog, { key: "Escape" });

	await waitFor(() => {
		expect(screen.queryByRole("dialog")).toBeNull();
	});
	expect(action).toHaveFocus();
}

async function keepsFocusInsideWhileOpen(): Promise<void> {
	renderMonitor([
		new RunRecordStageBuilder({
			stage: "plan",
			status: "graded",
		}).build(),
		new RunRecordStageBuilder().build(),
	]);
	const action = await inOutAction("plan");
	fireEvent.click(action);
	const dialog = await screen.findByRole("dialog", { name: /plan/u });
	await waitFor(() => {
		expect(dialog.contains(document.activeElement)).toBe(true);
	});

	action.focus();

	await waitFor(() => {
		expect(dialog.contains(document.activeElement)).toBe(true);
	});
}
