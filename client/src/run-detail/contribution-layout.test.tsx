import { afterEach, describe, expect, it } from "bun:test";

import { screen, within } from "@testing-library/react";

import { renderContribution } from "#client/test-support/run-detail";

import {
	originalFetch,
	renderWithAnalysis,
} from "./contribution-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("the full workflow's analysis map", () => {
	it(
		"shows one chip per declared step with its number, name, grade and role",
		showsOneChipPerDeclaredStepWithItsNumberNameGradeAndRole,
	);

	it(
		"leaves the role off each chip while no analysis is recorded",
		leavesTheRoleOffEachChipWhileNoAnalysisIsRecorded,
	);
});

async function showsOneChipPerDeclaredStepWithItsNumberNameGradeAndRole(): Promise<void> {
	renderWithAnalysis();

	const map = await screen.findByRole("list", { name: "Step map" });
	await within(map).findByText("root cause");
	const chips = within(map).getAllByRole("listitem");

	expect(chips.map((chip) => chip.textContent)).toEqual([
		"1shapeA·not a factor",
		"2buildD✕root cause",
		"3verify—○never ran",
	]);
}

async function leavesTheRoleOffEachChipWhileNoAnalysisIsRecorded(): Promise<void> {
	renderContribution();

	const map = await screen.findByRole("list", { name: "Step map" });

	expect(
		within(map)
			.getAllByRole("listitem")
			.map((chip) => chip.textContent),
	).toEqual(["1shapeA", "2buildD", "3verify—"]);
}
