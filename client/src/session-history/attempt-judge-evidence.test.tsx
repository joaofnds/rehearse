import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, render, screen } from "@testing-library/react";

import { ScorecardEvidence } from "./attempt-evidence";
import { grade, originalFetch } from "./attempt-evidence-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("saved attempt evidence", () => {
	it(
		"renders projected worker output alongside one assessment and its exact citations",
		rendersProjectedWorkerOutputAlongsideOneAssessmentAndItsExactCitations,
	);

	it(
		"keeps clear blockers and their citations in a disclosure after failed findings",
		keepsClearBlockersAndTheirCitationsInADisclosureAfterFailedFindings,
	);

	it(
		"labels summary-only legacy grades and missing output explicitly",
		labelsSummaryOnlyLegacyGradesAndMissingOutputExplicitly,
	);
});

function rendersProjectedWorkerOutputAlongsideOneAssessmentAndItsExactCitations(): void {
	const expectedHeadingCount = 1;

	render(
		<ScorecardEvidence
			record={{
				assessment: grade,
				kind: "stage",
				output: {
					kind: "artifact",
					path: "delivery.md",
					state: "available",
					text: "Return {items: []}",
				},
				stage: "build",
				state: "available",
			}}
		/>,
	);
	expect(screen.getByRole("region", { name: "delivery.md" })).toHaveTextContent(
		"Return {items: []}",
	);
	expect(
		screen.getAllByRole("heading", { name: "Step Judge assessment" }),
	).toHaveLength(expectedHeadingCount);
	expect(screen.getByText("The response has no hasMore.")).toBeInTheDocument();
	expect(screen.getByText(/delivery.md:1/u)).toBeInTheDocument();
}

function keepsClearBlockersAndTheirCitationsInADisclosureAfterFailedFindings(): void {
	render(
		<ScorecardEvidence
			record={{
				assessment: {
					...grade,
					hardBlockers: [
						{
							evidence: [
								{
									claim: "No secret material.",
									path: "delivery.md",
									quote: "checked",
									source: "artifact",
								},
							],
							id: "no-secrets",
							status: "PASS",
						},
					],
				},
				kind: "stage",
				output: { reason: "No output retained.", state: "unavailable" },
				stage: "build",
				state: "available",
			}}
		/>,
	);

	const clear = screen.getByText("1 clear blocker & citations", {
		selector: "summary",
	});
	expect(clear.parentElement).not.toHaveAttribute("open");
	fireEvent.click(clear);

	expect(screen.getByText("No secret material.")).toBeInTheDocument();
	expect(screen.getByText("checked")).toBeInTheDocument();
	expect(screen.getByText("FAIL · Requirement · response")).toBeInTheDocument();
}

function labelsSummaryOnlyLegacyGradesAndMissingOutputExplicitly(): void {
	render(
		<ScorecardEvidence
			record={{
				assessment: {
					detailed: false,
					dimensions: [],
					grade: "B",
					hardBlockers: [],
					requirements: [],
					verdict: "CONTINUE",
				},
				kind: "stage",
				output: { reason: "Output was not retained.", state: "unavailable" },
				stage: "build",
				state: "available",
			}}
		/>,
	);
	expect(
		screen.getByText("Output unavailable in this saved record."),
	).toBeInTheDocument();
	expect(screen.getByText(/summary grade only/u)).toBeInTheDocument();
}
