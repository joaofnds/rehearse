import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { renderAppWithStub } from "#client/test-support/render-app";

import {
	card,
	originalFetch,
	pipelineCase,
	renderCasesAt,
	sessionCase,
	workflowCaseResources,
} from "./case-page-fixtures";
import CasesPage from "./cases-page";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(CasesPage.name, () => {
	describe("workflow navigation", workflowCaseNavigation);

	it(
		"opens from the Cases nav item under its header naming where cases are declared",
		opensFromTheCasesNavItemUnderItsHeaderNamingWhereCasesAreDeclared,
	);

	it(
		"opens from Declare a case on the run history's empty state",
		opensFromDeclareACaseOnTheRunHistorySEmptyState,
	);

	it.each([
		{ attempts: "×1", button: "Run once" },
		{ attempts: "×3", button: "Run group" },
	])(
		"opens the launch dialog from $button with the case picked and $attempts pressed",
		async ({ button, attempts }) => {
			renderCasesAt("/cases", { cases: [sessionCase(), pipelineCase()] });

			fireEvent.click(
				within(await card("audit-log")).getByRole("button", { name: button }),
			);

			const dialog = await screen.findByRole("dialog");
			await within(dialog).findByRole("option", { name: /^audit-log/u });
			await waitFor(() => {
				expect(within(dialog).getByLabelText("Case")).toHaveValue("audit-log");
			});
			expect(
				within(dialog).getByRole("button", { name: attempts }),
			).toHaveAttribute("aria-pressed", "true");
		},
	);
});

function workflowCaseNavigation(): void {
	beforeEach(async () => {
		renderAppWithStub("/cases", workflowCaseResources());
		const pipeline = await card("audit-log");
		fireEvent.click(
			within(pipeline).getByRole("link", { name: "View workflow" }),
		);
		await screen.findByText("cases/audit-log/pipelines/default.json");
	});
	it("shows the selected case's workflow beneath Cases", showsSelectedWorkflow);
	it(
		"offers workflow editing and bundle actions under one heading",
		offersWorkflowActions,
	);
	it("returns to every workflow from the case filter", returnsToAllWorkflows);
}
async function showsSelectedWorkflow(): Promise<void> {
	expect(
		await screen.findByRole("heading", { level: 1, name: "Cases" }),
	).toBeInTheDocument();
	expect(screen.getByRole("link", { name: "Workflows" })).toHaveAttribute(
		"aria-current",
		"page",
	);
	expect(
		await screen.findByText("cases/audit-log/pipelines/default.json"),
	).toBeInTheDocument();
	expect(screen.queryByText("other.json")).not.toBeInTheDocument();
}
function offersWorkflowActions(): void {
	const expectedHeadingCount = 1;
	expect(
		screen.getByRole("button", { name: "Edit steps" }),
	).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Import workflow" }),
	).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Export with judges" }),
	).toBeInTheDocument();
	expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(
		expectedHeadingCount,
	);
}
async function returnsToAllWorkflows(): Promise<void> {
	fireEvent.click(screen.getByRole("link", { name: "All workflows" }));
	expect(await screen.findByText("other.json")).toBeInTheDocument();
	expect(screen.getByText("Used by: other-case")).toBeInTheDocument();
}

async function opensFromTheCasesNavItemUnderItsHeaderNamingWhereCasesAreDeclared(): Promise<void> {
	renderCasesAt("/", { cases: [pipelineCase()] });

	fireEvent.click(await screen.findByRole("link", { name: /^Cases/u }));

	expect(
		await screen.findByRole("heading", { level: 1, name: "Cases" }),
	).toBeInTheDocument();
	expect(
		screen.getByText("Declared as data on disk · cases/*/case.json"),
	).toBeInTheDocument();
}

async function opensFromDeclareACaseOnTheRunHistorySEmptyState(): Promise<void> {
	renderCasesAt("/", { cases: [pipelineCase()] });

	fireEvent.click(await screen.findByRole("link", { name: "Declare a case" }));

	expect(
		await screen.findByRole("heading", { level: 1, name: "Cases" }),
	).toBeInTheDocument();
}
