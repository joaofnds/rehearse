import { afterEach, describe, expect, it } from "bun:test";

import { screen } from "@testing-library/react";

import { renderAppAt, stubFetchFailing } from "#client/test-support/render-app";

import {
	originalFetch,
	pipelineCase,
	renderCasesAt,
} from "./case-page-fixtures";
import CasesPage from "./cases-page";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(CasesPage.name, () => {
	it(
		"guides an empty successful collection toward its first declaration",
		guidesAnEmptySuccessfulCollectionTowardItsFirstDeclaration,
	);

	it(
		"keeps a missing selected case distinct from an empty collection",
		keepsAMissingSelectedCaseDistinctFromAnEmptyCollection,
	);

	it.each(["unreadable", "unreadableRecords"] as const)(
		"does not call a collection empty when %s evidence is present",
		async (field) => {
			renderCasesAt("/cases", {
				cases: [],
				problems: {
					[field]: [{ id: "broken", reason: "not valid JSON" }],
				},
			});

			expect(await screen.findByRole("alert")).toHaveTextContent(
				"broken: not valid JSON",
			);
			expect(
				screen.queryByRole("heading", { name: "No cases yet" }),
			).toBeNull();
		},
	);

	describe("when a declaration or a run record cannot be read", () => {
		it(
			"names each beside the cases it could read",
			namesEachBesideTheCasesItCouldRead,
		);
	});

	describe("when the cases cannot be read", () => {
		it("says so", saysSo);
	});
});

async function guidesAnEmptySuccessfulCollectionTowardItsFirstDeclaration(): Promise<void> {
	const expectedButtonCount = 1;

	renderCasesAt("/cases", { cases: [] });

	expect(
		await screen.findByRole("heading", { name: "No cases yet" }),
	).toBeVisible();
	expect(
		screen.getByText(
			"Use Declare a case above to add a session or workflow case.",
		),
	).toBeVisible();
	expect(
		screen.getAllByRole("button", { name: "Declare a case" }),
	).toHaveLength(expectedButtonCount);
}

async function keepsAMissingSelectedCaseDistinctFromAnEmptyCollection(): Promise<void> {
	renderCasesAt("/cases?caseId=missing", { cases: [] });

	expect(await screen.findByRole("alert")).toHaveTextContent(
		"Case missing was not found among the readable declarations.",
	);
	expect(screen.queryByRole("heading", { name: "No cases yet" })).toBeNull();
}

async function namesEachBesideTheCasesItCouldRead(): Promise<void> {
	renderCasesAt("/cases", {
		cases: [pipelineCase()],
		problems: {
			unreadable: [{ id: "broken", reason: "not valid JSON" }],
			unreadableRecords: [{ id: "group-x", reason: "JSON Parse error" }],
		},
	});

	expect(await screen.findByText("broken: not valid JSON")).toBeInTheDocument();
	expect(screen.getByText("group-x: JSON Parse error")).toBeInTheDocument();
	expect(
		screen.getByRole("article", { name: "audit-log" }),
	).toBeInTheDocument();
}

async function saysSo(): Promise<void> {
	stubFetchFailing("/api/cases");
	renderAppAt("/cases");

	expect(await screen.findByRole("alert")).toHaveTextContent(
		"Could not load the cases.",
	);
	expect(screen.queryByRole("heading", { name: "No cases yet" })).toBeNull();
}
