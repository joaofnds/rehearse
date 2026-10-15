import { afterEach, describe, expect, it } from "bun:test";
import { renderWithRouter } from "#client/test-support/render-app";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import { EvidenceDialogLink } from "./evidence-dialog";
import type { EvidenceSourceIdentity } from "./evidence-source-query";

const originalFetch = globalThis.fetch;
const STAGE: EvidenceSourceIdentity = {
	kind: "stage",
	run: "run-a",
	stage: "build",
	section: "requirements",
	item: "scope",
	index: "0",
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
					record: "run-a.build.json",
					source: "diff",
					path: "src/build.ts",
					claim: "the build is wired",
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
	it("opens the cited source beside the selected step, with a full-page link, then returns focus on Escape", async () => {
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

		fireEvent.keyDown(document, { key: "Escape" });
		await waitFor(() => {
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
			expect(citation).toHaveFocus();
		});
	});

	it("leaves modified and middle clicks as ordinary link navigation", () => {
		show();
		const citation = screen.getByRole("link", { name: "src/build.ts:14" });
		expect(fireEvent.click(citation, { ctrlKey: true })).toBe(true);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(fireEvent.click(citation, { metaKey: true })).toBe(true);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(fireEvent.click(citation, { button: 1 })).toBe(true);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});
});
