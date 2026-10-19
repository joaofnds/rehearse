import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import AnalysisReadingBuilder from "#client/test-support/analysis-reading-test-builder";
import {
	ANALYSES,
	RUN,
	renderContribution,
} from "#client/test-support/run-detail";

import {
	analysisStepRow,
	originalFetch,
	renderWithAnalysis,
} from "./contribution-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe("the Root-cause analysis section", () => {
	it(
		"reads the step note, destination and unrun qualification",
		readsStepNoteAndReportDestination,
	);
	it(
		"discloses a recorded analysis as one agent's reading, with its provenance and root cause",
		disclosesARecordedAnalysisAsOneAgentSReadingWithItsProvenanceAndRootCause,
	);

	it(
		"counts two earlier analyses in the plural",
		countsTwoEarlierAnalysesInThePlural,
	);

	it(
		"reads each step with its grade track, role, note and step report",
		readsEachStepWithItsGradeTrackRoleNoteAndStepReport,
	);

	it(
		"opens Results on the step whose Step report is chosen",
		opensResultsOnTheStepWhoseStepReportIsChosen,
	);
});

async function disclosesARecordedAnalysisAsOneAgentSReadingWithItsProvenanceAndRootCause(): Promise<void> {
	renderWithAnalysis();

	const section = await screen.findByRole("region", {
		name: "Root-cause analysis",
	});
	await within(section).findByText(/an agent read the recorded steps/u);

	expect(section).toHaveTextContent(
		"an agent read the recorded steps · $0.24 · 41s",
	);
	expect(section).toHaveTextContent(
		"root cause: skills/implement.md · lines 12–30",
	);
	expect(section).toHaveTextContent(
		"Build skipped the scope declaration the shape step asked for.",
	);
	expect(section).toHaveTextContent(
		"This is one agent's reading of the evidence, not a measurement. The way to confirm it is a paired rerun with that block changed and nothing else.",
	);
	expect(section).toHaveTextContent(
		"Replay step 2 with the scope-declaration block changed and nothing else.",
	);
	expect(section).toHaveTextContent("1 earlier analysis");
}

async function countsTwoEarlierAnalysesInThePlural(): Promise<void> {
	renderContribution(
		new Map([
			[ANALYSES, new AnalysisReadingBuilder({ earlierCount: 2 }).build()],
		]),
	);

	const section = await screen.findByRole("region", {
		name: "Root-cause analysis",
	});

	expect(section).toHaveTextContent("2 earlier analyses recorded");
}

async function readsEachStepWithItsGradeTrackRoleNoteAndStepReport(): Promise<void> {
	renderWithAnalysis();

	const rows = await screen.findByRole("list", {
		name: "Steps as the analysis read them",
	});
	const build = await analysisStepRow("build");

	expect(build).toHaveTextContent("▯▯▯▮▯");
	expect(within(rows).getByText("shape").closest("li")).toHaveTextContent(
		"A ▮▯▯▯▯",
	);
	expect(build).toHaveTextContent("✕ root cause");
}

async function readsStepNoteAndReportDestination(): Promise<void> {
	renderWithAnalysis();

	const rows = await screen.findByRole("list", {
		name: "Steps as the analysis read them",
	});
	const build = await analysisStepRow("build");

	expect(build).toHaveTextContent("Build ignored the declared scope.");
	expect(
		within(build).getByRole("link", { name: "Step report" }),
	).toHaveAttribute("href", `/runs/${RUN}?view=results&step=build`);
	expect(within(rows).getByText("verify").closest("li")).toHaveTextContent(
		"○ never ran",
	);
}

async function opensResultsOnTheStepWhoseStepReportIsChosen(): Promise<void> {
	renderWithAnalysis();

	const firstStep = await analysisStepRow("shape");

	fireEvent.click(within(firstStep).getByRole("link", { name: "Step report" }));

	expect(
		await screen.findByRole("heading", { name: "Step 1 · shape" }),
	).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Results" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
}
