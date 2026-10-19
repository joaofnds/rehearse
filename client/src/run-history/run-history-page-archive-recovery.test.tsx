import { describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor } from "@testing-library/react";

import RunHistoryPage from "./run-history-page";
import {
	prepareLegacyArchive,
	reloadArchivePage,
} from "./run-history-page-archive-driver";
import { groupId, serveArchiveHistory } from "./run-history-page-archive-fake";
import {
	registerRunHistoryTestCleanup,
	renderPage,
} from "./run-history-page-test-harness";

async function testKeepsRestoreReachableWhileALegacyArchiveRefreshIsHeldAndAfterReloading(): Promise<void> {
	const { held, driver } = await prepareLegacyArchive();

	fireEvent.click(screen.getByRole("button", { name: `Archive ${groupId}` }));
	await held.reached;
	await waitFor(() => {
		expect(
			screen.queryByRole("button", { name: "Review incomplete runs" }) === null,
		).toBe(true);
		expect(driver.emptyHeading === null).toBe(true);
	});
	held.release();

	await waitFor(async () => {
		expect(await driver.findArchivedToggle()).toBeEnabled();
		expect(driver.emptyHeading).not.toBeInTheDocument();
	});
	reloadArchivePage();
	fireEvent.click(
		await screen.findByRole("button", { name: "Archived incomplete runs (1)" }),
	);
	fireEvent.click(screen.getByRole("button", { name: `Restore ${groupId}` }));
	await waitFor(async () => {
		expect(await driver.reviewButton()).toBeEnabled();
		expect(driver.emptyHeading).not.toBeInTheDocument();
	});
}

async function testDiscoversExistingArchivesOnAFreshPage(): Promise<void> {
	serveArchiveHistory({ archived: [groupId] });
	renderPage();

	fireEvent.click(
		await screen.findByRole("button", { name: "Archived incomplete runs (1)" }),
	);

	expect(screen.getByText(groupId)).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: `Restore ${groupId}` }),
	).toBeEnabled();
	expect(
		screen.queryByRole("button", { name: "Review incomplete runs" }),
	).not.toBeInTheDocument();
}

async function testClearsInvalidArchiveMetadataWithoutHidingTheIncompleteRun(): Promise<void> {
	serveArchiveHistory({ invalidMetadata: true });
	renderPage();

	fireEvent.click(
		await screen.findByRole("button", {
			name: `Clear archive state ${groupId}`,
		}),
	);

	expect(
		await screen.findByText(
			`Archive cleared for ${groupId}. Saved files are unchanged.`,
		),
	).toHaveFocus();
	expect(
		screen.getByRole("button", { name: "Review incomplete runs" }),
	).toBeEnabled();
	expect(
		screen.queryByRole("button", { name: `Clear archive state ${groupId}` }),
	).not.toBeInTheDocument();
}

async function testKeepsAnArchiveAvailableWhenRestorationFails(): Promise<void> {
	serveArchiveHistory({
		archived: [groupId],
		restoreRefusal: {
			body: { error: "Archive state could not be changed." },
			status: 500,
		},
	});
	renderPage();

	fireEvent.click(
		await screen.findByRole("button", { name: "Archived incomplete runs (1)" }),
	);
	fireEvent.click(screen.getByRole("button", { name: `Restore ${groupId}` }));

	expect(await screen.findByRole("alert")).toHaveTextContent(
		"Archive state could not be changed.",
	);
	expect(screen.getByRole("alert")).toHaveFocus();
	expect(
		screen.getByRole("button", { name: `Restore ${groupId}` }),
	).toBeEnabled();
}

registerRunHistoryTestCleanup();

function recoveringArchives(): void {
	it(
		"keeps Restore reachable while a legacy archive refresh is held and after reloading",
		testKeepsRestoreReachableWhileALegacyArchiveRefreshIsHeldAndAfterReloading,
	);
	it(
		"discovers existing archives on a fresh page",
		testDiscoversExistingArchivesOnAFreshPage,
	);
	it(
		"clears invalid archive metadata without hiding the incomplete run",
		testClearsInvalidArchiveMetadataWithoutHidingTheIncompleteRun,
	);
	it(
		"keeps an archive available when restoration fails",
		testKeepsAnArchiveAvailableWhenRestorationFails,
	);
}
describe(RunHistoryPage.name, () => {
	describe("when a confirmation has no saved summary", () => {
		describe(
			"when reading or recovering saved archive state",
			recoveringArchives,
		);
	});
});
