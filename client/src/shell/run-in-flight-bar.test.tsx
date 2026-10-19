import { afterEach, describe, expect, it } from "bun:test";

import { screen, waitFor, within } from "@testing-library/react";

import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import ListedStageGradeBuilder from "#client/test-support/listed-stage-grade-test-builder";
import { renderAppWithStub } from "#client/test-support/render-app";

import {
	IN_FLIGHT,
	bar,
	originalFetch,
	renderRunInFlight,
} from "./in-flight-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("the run in flight on every screen", () => {
	it(
		"shows the run's readings on a screen other than run history",
		showsTheRunSReadingsOnAScreenOtherThanRunHistory,
	);

	it(
		"names the run within its case, since the case is named beside it",
		namesTheRunWithinItsCaseSinceTheCaseIsNamedBesideIt,
	);

	it(
		"marks the run with the pulsing glyph alone, as the design draws it",
		marksTheRunWithThePulsingGlyphAloneAsTheDesignDrawsIt,
	);

	it(
		"draws the spend track at the design's 76 by 5px with its 3px radius",
		drawsTheSpendTrackAtTheDesignS76By5pxWithIts3pxRadius,
	);

	it(
		"separates its readings where the design does and nowhere else",
		separatesItsReadingsWhereTheDesignDoesAndNowhereElse,
	);

	it(
		"shows a dash with its reason rather than a figure it cannot vouch for",
		showsADashWithItsReasonRatherThanAFigureItCannotVouchFor,
	);

	it(
		"ticks the elapsed clock each second between the run's own readings",
		ticksTheElapsedClockEachSecondBetweenTheRunSOwnReadings,
	);

	it(
		"pulses its glyph only for readers who did not ask for reduced motion",
		pulsesItsGlyphOnlyForReadersWhoDidNotAskForReducedMotion,
	);
});

async function showsTheRunSReadingsOnAScreenOtherThanRunHistory(): Promise<void> {
	const runListing = new NamedHistoryBuilder({
		rows: [
			new PipelineRunRowBuilder({
				launchId: "launch-1",
				stageGrades: {
					grades: [
						new ListedStageGradeBuilder({ stage: "plan" })
							.graded({ letter: "B+" })
							.build(),
						new ListedStageGradeBuilder({ stage: "build" }).build(),
					],
					state: "available",
				},
			})
				.withExecutionProgress({
					ceilingUsd: 20,
					runSpentUsd: 1.83,
					stage: "build",
				})
				.build(),
		],
	}).build();

	renderAppWithStub("/corpus", new Map([["/api/run-listing", runListing]]));

	const shown = await screen.findByRole("region", { name: IN_FLIGHT });
	expect(shown).toHaveTextContent("r-0148");
	expect(shown).toHaveTextContent("audit-log");
	expect(shown).toHaveTextContent("step 2 of 2 · build");
	expect(shown).toHaveTextContent("session running");
	expect(shown).toHaveTextContent("$1.83 / $20.00");
	expect(shown).toHaveTextContent("grades so far B+");
	expect(within(shown).getByRole("button", { name: "Stop" })).toBeEnabled();
}

function namesTheRunWithinItsCaseSinceTheCaseIsNamedBesideIt(): void {
	renderRunInFlight([
		new PipelineRunRowBuilder({ shortId: "audit-log/r33" })
			.withExecutionProgress()
			.build(),
	]);

	expect(within(bar()).getByText("r33")).toBeInTheDocument();
}

function marksTheRunWithThePulsingGlyphAloneAsTheDesignDrawsIt(): void {
	renderRunInFlight([
		new PipelineRunRowBuilder({}).withExecutionProgress().build(),
	]);

	expect(within(bar()).queryByText("running")).not.toBeInTheDocument();
}

function drawsTheSpendTrackAtTheDesignS76By5pxWithIts3pxRadius(): void {
	renderRunInFlight([
		new PipelineRunRowBuilder({})
			.withExecutionProgress({ ceilingUsd: 20, runSpentUsd: 1.83 })
			.build(),
	]);

	const fill = bar().querySelector("[style*='--spend-share']");

	expect(fill?.parentElement).toHaveClass(
		"h-spend-track-height",
		"w-spend-track-width",
		"rounded-xs",
	);
}

function separatesItsReadingsWhereTheDesignDoesAndNowhereElse(): void {
	const expectedMatchingElementsCount = 3;

	renderRunInFlight([
		new PipelineRunRowBuilder({
			stageGrades: {
				grades: [
					new ListedStageGradeBuilder({ stage: "plan" })
						.graded({ letter: "B+" })
						.build(),
					new ListedStageGradeBuilder({ stage: "build" }).build(),
				],
				state: "available",
			},
		})
			.withExecutionProgress({ ceilingUsd: 20, runSpentUsd: 1.83 })
			.build(),
	]);

	expect(within(bar()).getAllByText("│")).toHaveLength(
		expectedMatchingElementsCount,
	);
}

function showsADashWithItsReasonRatherThanAFigureItCannotVouchFor(): void {
	renderRunInFlight([
		new PipelineRunRowBuilder({})
			.withExecutionProgress({ ceilingUsd: 20 })
			.build(),
	]);

	expect(bar()).toHaveTextContent("— run spend not recorded / $20.00");
}

async function ticksTheElapsedClockEachSecondBetweenTheRunSOwnReadings(): Promise<void> {
	renderRunInFlight([
		new PipelineRunRowBuilder({})
			.withExecutionProgress({
				elapsedMs: 9000,
				measuredAt: new Date().toISOString(),
			})
			.build(),
	]);

	expect(bar()).toHaveTextContent("00:09");
	await waitFor(
		() => {
			expect(bar()).toHaveTextContent("00:10");
		},
		{ timeout: 2000 },
	);
}

function pulsesItsGlyphOnlyForReadersWhoDidNotAskForReducedMotion(): void {
	renderRunInFlight([
		new PipelineRunRowBuilder({}).withExecutionProgress().build(),
	]);

	const glyph = within(bar()).getByText("●");
	expect(glyph).toHaveClass("animate-live");
	expect(glyph).toHaveClass("motion-reduce:animate-none");
}
