import { describe, expect, it } from "bun:test";

import { waitFor } from "@testing-library/react";

import RunHistoryPage from "./run-history-page";
import { groupId, serveArchiveHistory } from "./run-history-page-archive-fake";
import {
	registerRunHistoryTestCleanup,
	renderPage,
} from "./run-history-page-test-harness";

const SUMMARY_COMPLETIONS = ["valid", "malformed"] as const;
const ARCHIVE_REFETCH_TIMEOUT_MS = 10_000;

async function testFollowsAnotherClientSArchiveAndRestoreWhileRunsStaysMounted(): Promise<void> {
	const history = serveArchiveHistory({ keepRun: true });
	const page = renderPage();
	await page.findByRole("button", { name: "Review incomplete runs" });

	history.archiveFromAnotherClient();

	await waitFor(
		() => {
			expect(
				page.queryByRole("button", { name: "Archived incomplete runs (1)" }) !==
					null,
			).toBe(true);
			expect(
				page.queryByRole("button", { name: "Review incomplete runs" }) === null,
			).toBe(true);
		},
		{ timeout: 3000 },
	);

	history.restoreFromAnotherClient();
	await waitFor(
		() => {
			expect(
				page.queryByRole("button", { name: "Review incomplete runs" }) !== null,
			).toBe(true);
			expect(
				page.queryByRole("button", { name: "Archived incomplete runs (1)" }) ===
					null,
			).toBe(true);
		},
		{ timeout: 3000 },
	);
}

async function testRemovesArchiveAfterSummary(
	summary: "valid" | "malformed",
): Promise<void> {
	const history = serveArchiveHistory({
		archived: [groupId],
		keepRun: true,
		summary,
	});
	const page = renderPage();
	await page.findByRole("button", { name: "Archived incomplete runs (1)" });

	history.saveSummary();

	await waitFor(
		() => {
			expect(
				page.queryByRole("button", { name: "Archived incomplete runs (1)" }) ===
					null,
			).toBe(true);
		},
		{ timeout: 3000 },
	);
	expect(
		page.queryByRole("button", { name: `Restore ${groupId}` }),
	).not.toBeInTheDocument();
	expect(
		summary === "valid" ? page.getByText(groupId) : page.getByRole("alert"),
	).toBeInTheDocument();
}

registerRunHistoryTestCleanup();

function pollingSharedRecords(): void {
	it(
		"follows another client's archive and restore while Runs stays mounted",
		testFollowsAnotherClientSArchiveAndRestoreWhileRunsStaysMounted,
		ARCHIVE_REFETCH_TIMEOUT_MS,
	);
	it.each([...SUMMARY_COMPLETIONS])(
		"removes an archived item when a %s summary arrives during polling",
		testRemovesArchiveAfterSummary,
	);
}
describe(RunHistoryPage.name, () => {
	describe("when a confirmation has no saved summary", () => {
		describe(
			"when confirmation records change during polling",
			pollingSharedRecords,
		);
	});
});
