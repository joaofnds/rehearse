import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor } from "@testing-library/react";

import {
	navigationWouldHaveLanded,
	originalFetch,
	renderShellAt,
} from "./shell-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("the navigation shell", () => {
	it(
		"reaches run history from another screen by pressing g then r",
		reachesRunHistoryFromAnotherScreenByPressingGThenR,
	);

	it(
		"reaches the live monitor from another screen by pressing g then m",
		reachesTheLiveMonitorFromAnotherScreenByPressingGThenM,
	);

	it(
		"stays put when r is pressed without its g prefix",
		staysPutWhenRIsPressedWithoutItsGPrefix,
	);

	it(
		"leaves the chord alone while the operator is typing in a field",
		leavesTheChordAloneWhileTheOperatorIsTypingInAField,
	);
});

async function reachesRunHistoryFromAnotherScreenByPressingGThenR(): Promise<void> {
	renderShellAt("/corpus", { corpusFiles: 137, runs: 0 });

	await waitFor(() => {
		expect(
			screen.getByRole("heading", { name: "Instruction corpus" }),
		).toBeInTheDocument();
	});

	fireEvent.keyDown(document, { key: "g" });
	fireEvent.keyDown(document, { key: "r" });

	await waitFor(() => {
		expect(screen.getByRole("heading", { name: "Runs" })).toBeInTheDocument();
	});
}

async function reachesTheLiveMonitorFromAnotherScreenByPressingGThenM(): Promise<void> {
	const router = renderShellAt("/corpus", { corpusFiles: 137, runs: 0 });
	await screen.findByRole("heading", { name: "Instruction corpus" });

	fireEvent.keyDown(document, { key: "g" });
	fireEvent.keyDown(document, { key: "m" });

	await waitFor(() => {
		expect(router.state.location.pathname).toBe("/monitor");
	});
}

async function staysPutWhenRIsPressedWithoutItsGPrefix(): Promise<void> {
	renderShellAt("/corpus", { corpusFiles: 137, runs: 0 });

	await waitFor(() => {
		expect(
			screen.getByRole("heading", { name: "Instruction corpus" }),
		).toBeInTheDocument();
	});

	fireEvent.keyDown(document, { key: "r" });

	await navigationWouldHaveLanded();

	expect(
		screen.queryByRole("heading", { name: "Runs" }),
	).not.toBeInTheDocument();
}

async function leavesTheChordAloneWhileTheOperatorIsTypingInAField(): Promise<void> {
	renderShellAt("/corpus", { corpusFiles: 137, runs: 0 });

	await waitFor(() => {
		expect(
			screen.getByRole("heading", { name: "Instruction corpus" }),
		).toBeInTheDocument();
	});

	const field = document.createElement("input");
	document.body.append(field);
	field.focus();

	fireEvent.keyDown(field, { key: "g" });
	fireEvent.keyDown(field, { key: "r" });

	await navigationWouldHaveLanded();

	expect(
		screen.queryByRole("heading", { name: "Runs" }),
	).not.toBeInTheDocument();

	field.remove();
}
