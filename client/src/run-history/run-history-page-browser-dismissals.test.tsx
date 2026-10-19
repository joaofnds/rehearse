import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { screen } from "@testing-library/react";

import RunHistoryPage from "./run-history-page";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";

const key = "rehearse:record-issue-dismissals:v1";

async function testKeepsGenuineUnreadableEvidenceVisibleRegardlessOfBrowserPreferences(): Promise<void> {
	respondingWith({
		launches: [],
		rows: [],
		unreadable: [
			{ id: "run:unreadable", kind: "run", reason: "manifest.json is empty" },
		],
	});
	renderPage();

	expect(await screen.findByRole("alert")).toHaveTextContent(
		"1 run could not be read",
	);
	expect(
		screen.queryByRole("button", { name: "Dismiss warning" }),
	).not.toBeInTheDocument();
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("when obsolete browser dismissals remain", () => {
		beforeEach(() => {
			globalThis.localStorage.setItem(
				key,
				JSON.stringify([
					JSON.stringify(["run", "run:unreadable", "manifest.json is empty"]),
				]),
			);
		});
		afterEach(() => {
			globalThis.localStorage.removeItem(key);
		});

		it(
			"keeps genuine unreadable evidence visible regardless of browser preferences",
			testKeepsGenuineUnreadableEvidenceVisibleRegardlessOfBrowserPreferences,
		);
	});
});
