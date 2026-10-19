import { beforeEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor } from "@testing-library/react";

import RunHistoryPage from "./run-history-page";
import {
	ArchiveHistoryDriver,
	preparePendingArchive,
} from "./run-history-page-archive-driver";
import {
	ArchiveHistoryFake,
	groupId,
	serveArchiveHistory,
} from "./run-history-page-archive-fake";
import ArchiveScenarioBuilder from "./run-history-page-archive-scenario-builder";
import {
	registerRunHistoryTestCleanup,
	renderPage,
} from "./run-history-page-test-harness";

const ARCHIVE_ACTIONS = ["archive", "restore"] as const;
const driver = new ArchiveHistoryDriver();
let history = new ArchiveHistoryFake(new ArchiveScenarioBuilder().build());

async function testArchivesAndRestoresARunThroughSharedRecordStateAndKeepsKeyboardFocus(): Promise<void> {
	expect(driver.incompleteRegion).toHaveTextContent(
		"Execution and cost are unknown",
	);
	fireEvent.click(driver.archiveButton);

	expect(await driver.archivedNotice()).toHaveFocus();
	expect(driver.missingIncompleteRegion).not.toBeInTheDocument();
	fireEvent.click(driver.archivedToggle);
	expect(screen.getByText(groupId)).toBeInTheDocument();
	fireEvent.click(driver.restoreButton);

	expect(await driver.restoredNotice()).toHaveFocus();
	expect(driver.incompleteRegion).toBeInTheDocument();
	expect(driver.missingArchivedToggle).not.toBeInTheDocument();
}

async function testKeepsAnIncompleteRunVisibleWhenArchivingIsRefused(): Promise<void> {
	history.archiveRefusal = {
		body: { error: "A summary was saved. Refresh to inspect it." },
		status: 409,
	};

	fireEvent.click(screen.getByRole("button", { name: `Archive ${groupId}` }));

	expect(await screen.findByRole("alert")).toHaveTextContent(
		"A summary was saved",
	);
	expect(screen.getByRole("alert")).toHaveFocus();
	expect(
		screen.getByRole("region", { name: "Incomplete confirmation runs" }),
	).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: `Archive ${groupId}` }),
	).toBeEnabled();
}

async function testShowsPendingArchiveAction(
	action: "archive" | "restore",
): Promise<void> {
	const { archive, restore, held, target } =
		await preparePendingArchive(action);
	fireEvent.click(action === "archive" ? archive : restore);
	await held.reached;

	await waitFor(() => {
		expect((action === "archive" ? archive : restore).textContent).toBe(
			action === "archive" ? "Archiving…" : "Restoring…",
		);
	});
	expect(archive).toBeDisabled();
	expect(restore).toBeDisabled();
	held.release();
	expect(
		await screen.findByText(
			action === "archive"
				? `Archived ${target}. Saved files are unchanged.`
				: `Archive cleared for ${target}. Saved files are unchanged.`,
		),
	).toHaveFocus();
}

registerRunHistoryTestCleanup();

function reviewingIncompleteConfirmation(): void {
	beforeEach(async () => {
		history = serveArchiveHistory();
		renderPage();
		fireEvent.click(await driver.reviewButton());
	});
	it(
		"archives and restores a run through shared record state and keeps keyboard focus",
		testArchivesAndRestoresARunThroughSharedRecordStateAndKeepsKeyboardFocus,
	);
	it(
		"keeps an incomplete run visible when archiving is refused",
		testKeepsAnIncompleteRunVisibleWhenArchivingIsRefused,
	);
}

function pendingArchiveAction(): void {
	it.each([...ARCHIVE_ACTIONS])(
		"shows pending %s and prevents conflicting actions",
		testShowsPendingArchiveAction,
	);
}
describe(RunHistoryPage.name, () => {
	describe("when a confirmation has no saved summary", () => {
		describe(
			"when reviewing a confirmation with no saved summary",
			reviewingIncompleteConfirmation,
		);
		describe("when another archive action is pending", pendingArchiveAction);
	});
});
