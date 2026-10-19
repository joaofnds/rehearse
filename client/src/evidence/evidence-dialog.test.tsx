import { afterEach, describe, expect, it } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { stubFetchByPath } from "#client/test-support/fetch-stub";
import { renderWithRouter } from "#client/test-support/render-app";

import EvidenceDialogLink from "./evidence-dialog";
import type { EvidenceSourceIdentity } from "./evidence-source-query";

const originalFetch = globalThis.fetch;
const STAGE: EvidenceSourceIdentity = {
	index: "0",
	item: "scope",
	kind: "stage",
	run: "run-a",
	section: "requirements",
	stage: "build",
};
const HREF = "/runs/run-a/stages/build/evidence/requirements/scope/0";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function show(identity: EvidenceSourceIdentity = STAGE): void {
	stubFetchByPath(
		new Map([
			[
				`/api${HREF}`,
				{
					claim: "the build is wired",
					path: "src/build.ts",
					record: "run-a.build.json",
					source: "diff",
					view: { kind: "absent" },
				},
			],
		]),
	);
	renderWithRouter(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			<div>
				<EvidenceDialogLink identity={identity}>
					src/build.ts:14
				</EvidenceDialogLink>
			</div>
		</QueryClientProvider>,
	);
}

describe(EvidenceDialogLink.name, () => {
	it(
		"opens the cited source beside the selected step with a full-page link",
		opensTheCitedSourceBesideTheSelectedStepWithAFullPageLinkThenReturnsFocusOnEscape,
	);

	it(
		"closes on Escape and returns focus to the citation",
		closesTheSourceAndRestoresCitationFocus,
	);

	it(
		"leaves modified and middle clicks as ordinary link navigation",
		leavesModifiedAndMiddleClicksAsOrdinaryLinkNavigation,
	);
});

async function opensTheCitedSourceBesideTheSelectedStepWithAFullPageLinkThenReturnsFocusOnEscape(): Promise<void> {
	show();
	const citation = screen.getByRole("link", { name: "src/build.ts:14" });
	expect(citation).toHaveAttribute("href", HREF);
	citation.focus();
	fireEvent.click(citation);

	const dialog = await screen.findByRole("dialog", { name: "Cited source" });
	expect(within(dialog).getByText("the build is wired")).toBeInTheDocument();
	expect(within(dialog).getByText("run-a.build.json")).toBeInTheDocument();
	expect(
		within(dialog).getByText(
			"The record holds no such source, so there is nothing to open.",
		),
	).toBeInTheDocument();
	expect(
		within(dialog).getByRole("link", { name: "Open full page" }),
	).toHaveAttribute("href", HREF);
}
async function closesTheSourceAndRestoresCitationFocus(): Promise<void> {
	show();
	const citation = screen.getByRole("link", { name: "src/build.ts:14" });
	citation.focus();
	fireEvent.click(citation);
	await screen.findByRole("dialog", { name: "Cited source" });
	fireEvent.keyDown(document, { key: "Escape" });
	await waitFor(() => {
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(citation).toHaveFocus();
	});
}

function leavesModifiedAndMiddleClicksAsOrdinaryLinkNavigation(): void {
	show();
	const citation = screen.getByRole("link", { name: "src/build.ts:14" });
	expect(fireEvent.click(citation, { ctrlKey: true })).toBe(true);
	expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	expect(fireEvent.click(citation, { metaKey: true })).toBe(true);
	expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	expect(fireEvent.click(citation, { button: 1 })).toBe(true);
	expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
}
