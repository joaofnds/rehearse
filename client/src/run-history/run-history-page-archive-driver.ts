import { cleanup, fireEvent, screen } from "@testing-library/react";

import { renderAppAt } from "#client/test-support/render-app";

import {
	archivedNeighbor,
	groupId,
	serveArchiveHistory,
} from "./run-history-page-archive-fake";
import type { ArchiveAction } from "./run-history-page-archive-scenario-builder";
import { holdResponses, renderPage } from "./run-history-page-test-harness";

/** Controls and status readings shared by archive interaction scenarios. */
class ArchiveHistoryDriver {
	public constructor(private readonly page: Readonly<typeof screen> = screen) {}
	public get incompleteRegion(): HTMLElement {
		return this.page.getByRole("region", {
			name: "Incomplete confirmation runs",
		});
	}

	public get missingIncompleteRegion(): HTMLElement | null {
		return this.page.queryByRole("region", {
			name: "Incomplete confirmation runs",
		});
	}

	public get archiveButton(): HTMLElement {
		return this.page.getByRole("button", { name: `Archive ${groupId}` });
	}

	public get restoreButton(): HTMLElement {
		return this.page.getByRole("button", { name: `Restore ${groupId}` });
	}

	public get archivedToggle(): HTMLElement {
		return this.page.getByRole("button", {
			name: "Archived incomplete runs (1)",
		});
	}

	public get missingArchivedToggle(): HTMLElement | null {
		return this.page.queryByRole("button", {
			name: "Archived incomplete runs (1)",
		});
	}

	public get emptyHeading(): HTMLElement | null {
		return this.page.queryByRole("heading", {
			name: "Nothing is measured yet",
		});
	}

	public async reviewButton(): Promise<HTMLElement> {
		return await this.page.findByRole("button", {
			name: "Review incomplete runs",
		});
	}

	public async findArchivedToggle(): Promise<HTMLElement> {
		return await this.page.findByRole("button", {
			name: "Archived incomplete runs (1)",
		});
	}

	public async archivedNotice(): Promise<HTMLElement> {
		return await this.page.findByText(
			`Archived ${groupId}. Saved files are unchanged.`,
		);
	}

	public async restoredNotice(): Promise<HTMLElement> {
		return await this.page.findByText(
			`Archive cleared for ${groupId}. Saved files are unchanged.`,
		);
	}
}

interface PendingArchive {
	readonly archive: HTMLElement;
	readonly restore: HTMLElement;
	readonly held: ReturnType<typeof holdResponses>;
	readonly target: string;
}
interface LegacyArchive {
	readonly driver: ArchiveHistoryDriver;
	readonly held: ReturnType<typeof holdResponses>;
}

async function preparePendingArchive(
	action: ArchiveAction,
): Promise<PendingArchive> {
	serveArchiveHistory({ archived: [archivedNeighbor], pendingAction: action });
	const held = holdResponses((request) => request.method === "POST");
	renderPage();
	const driver = new ArchiveHistoryDriver();
	fireEvent.click(await driver.reviewButton());
	fireEvent.click(await driver.findArchivedToggle());

	return {
		archive: driver.archiveButton,
		held,
		restore: screen.getByRole("button", {
			name: `Restore ${archivedNeighbor}`,
		}),
		target: action === "archive" ? groupId : archivedNeighbor,
	};
}

async function prepareLegacyArchive(): Promise<LegacyArchive> {
	const history = serveArchiveHistory({ legacy: true });
	const held = holdResponses(
		(request) =>
			history.isArchived &&
			request.method === "GET" &&
			new URL(request.url).pathname === "/api/confirmation-archives",
	);
	renderAppAt("/");
	const driver = new ArchiveHistoryDriver();
	fireEvent.click(await driver.reviewButton());

	return { driver, held };
}

function reloadArchivePage(): void {
	cleanup();
	renderAppAt("/");
}

export {
	ArchiveHistoryDriver,
	prepareLegacyArchive,
	preparePendingArchive,
	reloadArchivePage,
};
