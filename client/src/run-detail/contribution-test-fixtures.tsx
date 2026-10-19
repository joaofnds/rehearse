import { screen, within } from "@testing-library/react";

import AnalysisReadingBuilder from "#client/test-support/analysis-reading-test-builder";
import { ANALYSES, renderContribution } from "#client/test-support/run-detail";

const originalFetch = globalThis.fetch;

function renderWithAnalysis(): void {
	renderContribution(
		new Map([[ANALYSES, new AnalysisReadingBuilder().build()]]),
	);
}

async function analysisStepRow(stage: string): Promise<HTMLLIElement> {
	const rows = await screen.findByRole("list", {
		name: "Steps as the analysis read them",
	});
	const row = within(rows).getByText(stage).closest("li");
	if (!(row instanceof HTMLLIElement)) {
		throw new Error(`the ${stage} row is missing`);
	}

	return row;
}

export { analysisStepRow, originalFetch, renderWithAnalysis };
