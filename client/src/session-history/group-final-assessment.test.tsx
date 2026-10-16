import { afterEach, describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import { GroupFinalAssessment } from "./group-final-assessment";

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
	it("renders the saved independent final summary, requirements and citations", async () => {
		stubFetchByPath(
			new Map([
				[
					"/api/groups/group/reps/rep/attempt/final",
					{
						state: "available",
						summary: "The public response omitted hasMore.",
						requirements: [
							{
								id: "contract",
								status: "FAIL",
								evidence: [
									{
										source: "diff",
										path: "src/a.ts",
										claim: "The property is absent.",
										quote: "return {items: []}",
										place: "src/a.ts:12",
									},
								],
							},
						],
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
	});

	it("shows the saved unavailable reason without implying final failure", async () => {
		stubFetchByPath(
			new Map([
				[
					"/api/groups/group/reps/rep/attempt/final",
					{
						state: "unavailable",
						reason: "This older repetition retains the final verdict only.",
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
	});
	it("shows a final evidence read error instead of an empty assessment", async () => {
		stubFetchByPath(new Map());
		showFinal();

		expect(
			await screen.findByText(/Saved final Judge rationale unavailable/u),
		).toBeInTheDocument();
		expect(screen.queryByText(/^FAIL/u)).not.toBeInTheDocument();
	});
});
