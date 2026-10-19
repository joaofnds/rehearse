import { afterEach, describe, expect, it } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";

import { stubFetchByPath } from "#client/test-support/fetch-stub";

import GroupFinalAssessment from "./group-final-assessment";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});
function showFinal(): void {
	render(
		<QueryClientProvider
			client={
				new QueryClient({ defaultOptions: { queries: { retry: false } } })
			}
		>
			<GroupFinalAssessment groupId="group" repId="rep" />
		</QueryClientProvider>,
	);
}
describe(GroupFinalAssessment.name, () => {
	it(
		"renders the saved independent final summary, requirements and citations",
		rendersTheSavedIndependentFinalSummaryRequirementsAndCitations,
	);

	it(
		"shows the saved unavailable reason without implying final failure",
		showsTheSavedUnavailableReasonWithoutImplyingFinalFailure,
	);
	it(
		"shows a final evidence read error instead of an empty assessment",
		showsAFinalEvidenceReadErrorInsteadOfAnEmptyAssessment,
	);
});

async function rendersTheSavedIndependentFinalSummaryRequirementsAndCitations(): Promise<void> {
	stubFetchByPath(
		new Map([
			[
				"/api/groups/group/reps/rep/attempt/final",
				{
					requirements: [
						{
							evidence: [
								{
									claim: "The property is absent.",
									path: "src/a.ts",
									place: "src/a.ts:12",
									quote: "return {items: []}",
									source: "diff",
								},
							],
							id: "contract",
							status: "FAIL",
						},
					],
					state: "available",
					summary: "The public response omitted hasMore.",
				},
			],
		]),
	);
	showFinal();

	expect(
		await screen.findByText("The public response omitted hasMore."),
	).toBeInTheDocument();
	expect(screen.getByText("FAIL · contract")).toBeInTheDocument();
	expect(screen.getByText("The property is absent.")).toBeInTheDocument();
	expect(screen.getByText("return {items: []}")).toBeInTheDocument();
	expect(screen.getByText(/src\/a.ts:12/u)).toBeInTheDocument();
}

async function showsTheSavedUnavailableReasonWithoutImplyingFinalFailure(): Promise<void> {
	stubFetchByPath(
		new Map([
			[
				"/api/groups/group/reps/rep/attempt/final",
				{
					reason: "This older repetition retains the final verdict only.",
					state: "unavailable",
				},
			],
		]),
	);
	showFinal();

	expect(
		await screen.findByText(
			"This older repetition retains the final verdict only.",
		),
	).toBeInTheDocument();
	expect(screen.queryByText(/^FAIL/u)).not.toBeInTheDocument();
}

async function showsAFinalEvidenceReadErrorInsteadOfAnEmptyAssessment(): Promise<void> {
	stubFetchByPath(new Map());
	showFinal();

	expect(
		await screen.findByText(/Saved final Judge rationale unavailable/u),
	).toBeInTheDocument();
	expect(screen.queryByText(/^FAIL/u)).not.toBeInTheDocument();
}
