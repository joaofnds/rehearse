import { afterEach, describe, expect, it } from "bun:test";

import { screen, waitFor, within } from "@testing-library/react";

import { renderAppWithStub } from "#client/test-support/render-app";

import { originalFetch } from "./route-test-fixtures";
import createAppRouter from "./router";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(createAppRouter.name, () => {
	it(
		"opens a different section at the top of its workspace",
		opensADifferentSectionAtTheTopOfItsWorkspace,
	);

	it(
		"restores the workspace position when returning to a section",
		restoresTheWorkspacePositionWhenReturningToASection,
	);

	it.each([
		["/settings?view=judges", "Settings sections", "Judges"],
		["/cases?view=workflows", "Case sections", "Workflows"],
	])("marks only the selected section at %s", marksSelectedRouteSection);

	it(
		"opens Judge calibration within Settings",
		opensJudgeCalibrationWithinSettings,
	);
});

async function opensADifferentSectionAtTheTopOfItsWorkspace(): Promise<void> {
	renderAppWithStub(
		"/cases",
		new Map([
			["/api/cases", { cases: [], unreadable: [], unreadableRecords: [] }],
		]),
	);
	await screen.findByRole("heading", { level: 1, name: "Cases" });
	const workspace = screen.getByRole("main");
	workspace.scrollTop = 420;

	within(screen.getByRole("navigation", { name: "Sections" }))
		.getByRole("link", { name: "Settings" })
		.click();
	await screen.findByRole("heading", { level: 1, name: "Settings" });

	await waitFor(() => {
		const expectedScrollTop = 0;

		expect(workspace.scrollTop).toBe(expectedScrollTop);
	});
}

async function restoresTheWorkspacePositionWhenReturningToASection(): Promise<void> {
	const router = renderAppWithStub(
		"/cases",
		new Map([
			["/api/cases", { cases: [], unreadable: [], unreadableRecords: [] }],
		]),
	);
	await screen.findByRole("heading", { level: 1, name: "Cases" });
	const workspace = screen.getByRole("main");
	workspace.scrollTop = 420;
	workspace.dispatchEvent(new Event("scroll", { bubbles: true }));
	within(screen.getByRole("navigation", { name: "Sections" }))
		.getByRole("link", { name: "Settings" })
		.click();
	await screen.findByRole("heading", { level: 1, name: "Settings" });

	router.history.back();
	await screen.findByRole("heading", { level: 1, name: "Cases" });

	await waitFor(() => {
		const expectedScrollTop = 420;

		expect(workspace.scrollTop).toBe(expectedScrollTop);
	});
}

async function opensJudgeCalibrationWithinSettings(): Promise<void> {
	renderAppWithStub(
		"/settings?view=judges",
		new Map([
			[
				"/api/calibration",
				{
					groups: [],
					next: null,
					reviews: 0,
					rows: [],
					ungraded: 0,
					withinOneStep: 0,
				},
			],
		]),
	);
	expect(
		await screen.findByRole("heading", { name: "Settings" }),
	).toBeInTheDocument();
	expect(
		await screen.findByRole("heading", { name: "Judge calibration" }),
	).toBeInTheDocument();
}

async function marksSelectedRouteSection(
	path: string,
	label: string,
	selected: string,
): Promise<void> {
	renderAppWithStub(
		path,
		new Map([
			["/api/cases", { cases: [], unreadable: [], unreadableRecords: [] }],
			["/api/pipelines", { pipelines: [], unreadable: [] }],
			[
				"/api/calibration",
				{
					groups: [],
					next: null,
					reviews: 0,
					rows: [],
					ungraded: 0,
					withinOneStep: 0,
				},
			],
		]),
	);

	const navigation = await screen.findByRole("navigation", { name: label });

	expect(
		within(navigation)
			.getAllByRole("link", { current: "page" })
			.map((link) => link.textContent),
	).toEqual([selected]);
}
