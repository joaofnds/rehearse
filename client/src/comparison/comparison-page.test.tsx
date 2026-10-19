import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { screen, within } from "@testing-library/react";

import { disputedStateComparison } from "./comparison-assessment-fixtures";
import { ComparisonPage } from "./comparison-page";
import {
	COMPARISON_ARM_COUNT,
	comparisonResponseBody,
	originalFetch,
	renderPage,
} from "./comparison-page-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(ComparisonPage.name, () => {
	describe("saved state and reply assessment layers", savedAssessmentLayers);

	it.each([
		[
			"session",
			"Recorded session check outcomes and saved state checks are shown separately",
		],
		["stage", "Step grades describe the replayed step only"],
		["pipeline", "The final workflow outcome is judged independently"],
	] as const)(
		"states the %s evaluation scope with its sample and corpus change",
		async (mode, scope) => {
			const body = comparisonResponseBody();
			renderPage({ ...body, report: { ...body.report, mode } });

			const lead = await screen.findByRole("region", {
				name: "What moved · case-1",
			});
			expect(lead).toHaveTextContent(scope);
			expect(lead).toHaveTextContent("Changed: output-styles/brief.md");
			expect(lead).toHaveTextContent(
				"Control 1 · Baseline (before) 1 · Candidate (after) 1",
			);
			expect(lead).toHaveTextContent("Pass rate · 95% confidence interval");
			expect(lead).toHaveTextContent("Coverage is shown per measure.");
		},
	);
});

function savedAssessmentLayers(): void {
	beforeEach(opensDisputedStateComparison);
	it(
		"shows saved state checks separately across all arms",
		showsSavedStateAssessments,
	);
	it(
		"retains reply checks alongside the failed saved state",
		showsReplyAssessments,
	);
	it("plots each arm's own saved-state success rate", showsPerArmStateRates);
}
async function opensDisputedStateComparison(): Promise<void> {
	renderPage(disputedStateComparison());
	await screen.findByRole("heading", {
		name: "Candidate passed saved state checks more often in this sample",
	});
}
function showsSavedStateAssessments(): void {
	const expectedMatchingElementsCount = 2;
	const state = screen.getByRole("region", { name: "Saved state checks" });
	expect(within(state).getAllByText("0/6 passed")).toHaveLength(
		expectedMatchingElementsCount,
	);
	expect(within(state).getByText("6/6 passed")).toBeInTheDocument();
	expect(
		within(state).getAllByText("6/6 attempts assessed · 19 checks each"),
	).toHaveLength(COMPARISON_ARM_COUNT);
}
function showsReplyAssessments(): void {
	const reply = screen.getByRole("region", {
		name: "Reply / transcript checks",
	});
	expect(within(reply).getAllByText("6/6 passed")).toHaveLength(
		COMPARISON_ARM_COUNT,
	);
}
function showsPerArmStateRates(): void {
	const state = screen.getByRole("region", { name: "Saved state checks" });
	for (const [label, expected] of [
		["Control", "0/6 passed"],
		["Baseline (before)", "0/6 passed"],
		["Candidate (after)", "6/6 passed"],
	] as const) {
		const metric = within(state).getByText(label).closest("div");
		if (metric === null) {
			throw new Error(`No metric for ${label}`);
		}
		expect(within(metric).getByText(expected)).toBeVisible();
	}
	expect(
		within(state).getByRole("figure", { name: /95% confidence interval/u }),
	).toHaveTextContent("61% to 100% · 100% observed rate");
}
