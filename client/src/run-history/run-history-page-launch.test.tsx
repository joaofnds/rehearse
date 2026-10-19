import { describe, expect, it } from "bun:test";

import { fireEvent, screen } from "@testing-library/react";

import { stubFetchByPath } from "#client/test-support/fetch-stub";

import RunHistoryPage from "./run-history-page";
import {
	registerRunHistoryTestCleanup,
	renderPage,
} from "./run-history-page-test-harness";

async function testOpensTheLaunchDialogFromNewRun(): Promise<void> {
	stubFetchByPath(
		new Map([["/api/run-listing", { launches: [], rows: [], unreadable: [] }]]),
	);
	renderPage();

	fireEvent.click(await screen.findByRole("button", { name: "New run" }));

	expect(
		await screen.findByRole("dialog", { name: "Start a run" }),
	).toBeInTheDocument();
}

async function testOpensTheLaunchDialogOnN(): Promise<void> {
	stubFetchByPath(
		new Map([["/api/run-listing", { launches: [], rows: [], unreadable: [] }]]),
	);
	renderPage();
	await screen.findByRole("button", { name: "New run" });

	fireEvent.keyDown(document.body, { key: "n" });

	expect(
		await screen.findByRole("dialog", { name: "Start a run" }),
	).toBeInTheDocument();
}

async function testLeavesAnNTypedIntoTheSearchFieldToTheSearch(): Promise<void> {
	stubFetchByPath(
		new Map([["/api/run-listing", { launches: [], rows: [], unreadable: [] }]]),
	);
	renderPage();
	await screen.findByRole("button", { name: "New run" });

	fireEvent.keyDown(screen.getByRole("searchbox"), { key: "n" });

	expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	it("opens the launch dialog on n", testOpensTheLaunchDialogOnN);

	it(
		"leaves an n typed into the search field to the search",
		testLeavesAnNTypedIntoTheSearchFieldToTheSearch,
	);
	it(
		"opens the launch dialog from New run",
		testOpensTheLaunchDialogFromNewRun,
	);
});
