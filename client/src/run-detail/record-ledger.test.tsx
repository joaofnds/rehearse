import { afterEach, describe, expect, it } from "bun:test";

import { within } from "@testing-library/react";

import ClosedStageSessionBuilder from "#client/test-support/closed-stage-session-test-builder";
import {
	FIRST_STEP_SESSION,
	STOPPED_STEP_JUDGE,
	judged,
	ledgerCard,
	ledgerCards,
	ledgerFooter,
	originalFetch,
	renderLedger,
	stoppedByVerdict,
} from "#client/test-support/run-detail/ledger-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("Record ledger", () => {
	it(
		"shows one card per stage with a record, in pipeline order",
		showsOneCardPerStageWithARecordInPipelineOrder,
	);

	it(
		"heads each card with its number, name, status, meta, corpus and grade",
		headsEachCardWithItsNumberNameStatusMetaCorpusAndGrade,
	);

	it(
		"marks the stage the run stopped at with the accent and no error colour",
		marksTheStageTheRunStoppedAtWithTheAccentAndNoErrorColour,
	);

	it(
		"heads a stage its judge stopped above the minimum as stopped alone",
		headsAStageItsJudgeStoppedAboveTheMinimumAsStoppedAlone,
	);

	it(
		"preserves the stage's hard blockers and dimensions in rubric order",
		preservesTheStageSHardBlockersAndDimensionsInRubricOrder,
	);

	it(
		"states whether each stage kept its checkpoint",
		statesWhetherEachStageKeptItsCheckpoint,
	);
});

async function showsOneCardPerStageWithARecordInPipelineOrder(): Promise<void> {
	renderLedger();

	const cards = await ledgerCards();

	expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual([
		"Step 1 · shape",
		"Step 2 · build",
	]);
}

async function headsEachCardWithItsNumberNameStatusMetaCorpusAndGrade(): Promise<void> {
	renderLedger(
		new Map([
			[
				FIRST_STEP_SESSION,
				new ClosedStageSessionBuilder({ lineCount: 402 }).build(),
			],
		]),
	);

	const firstStep = await ledgerCard("Step 1 · shape");

	expect(
		within(firstStep).getByRole("heading", { level: 2 }).parentElement,
	).toHaveTextContent(
		/^01shape✓Continued at minimum B1m22s · \$0\.34 · 402 linescorpus@a41c7eA$/u,
	);
}

async function marksTheStageTheRunStoppedAtWithTheAccentAndNoErrorColour(): Promise<void> {
	renderLedger();

	const firstStep = await ledgerCard("Step 1 · shape");
	const stoppedStep = await ledgerCard("Step 2 · build");

	expect(stoppedStep).toHaveClass("border-deeper");
	expect(stoppedStep.firstElementChild).toHaveClass("bg-fired");
	expect(stoppedStep).toHaveTextContent("◼below minimum B · run stopped");
	expect(stoppedStep.outerHTML).not.toMatch(/destructive|danger|red-/u);
	expect(firstStep).not.toHaveClass("border-deeper");
}

async function headsAStageItsJudgeStoppedAboveTheMinimumAsStoppedAlone(): Promise<void> {
	renderLedger(new Map(), stoppedByVerdict());

	const stoppedStep = await ledgerCard("Step 2 · build");

	expect(
		within(stoppedStep).getByRole("heading", { level: 2 }).parentElement,
	).toHaveTextContent(/^02build◼stopped— · /u);
}

async function preservesTheStageSHardBlockersAndDimensionsInRubricOrder(): Promise<void> {
	renderLedger(new Map([[STOPPED_STEP_JUDGE, judged()]]));

	const stoppedStep = await ledgerCard("Step 2 · build");
	const blockers = await within(stoppedStep).findByRole("list", {
		name: "Hard blockers",
	});
	const dimensions = within(stoppedStep).getByRole("list", {
		name: "Quality dimensions",
	});

	expect(
		within(blockers)
			.getAllByRole("listitem")
			.map((item) => item.textContent),
	).toEqual(["✕scope-declared-before-editfired", "✓no-secrets-in-diffclear"]);
	expect(
		within(dimensions)
			.getAllByRole("listitem")
			.map((item) => item.textContent),
	).toEqual(["scope-discipline▮▮▮▯▯C", "test-quality▮▮▮▮▯B"]);
	expect(blockers.parentElement?.nextElementSibling).toContainElement(
		dimensions,
	);
}

async function statesWhetherEachStageKeptItsCheckpoint(): Promise<void> {
	renderLedger();

	const firstStep = await ledgerFooter("Step 1 · shape");
	const stoppedStep = await ledgerFooter("Step 2 · build");

	expect(
		within(firstStep).getByText("c-0147-1 · frozen state retained"),
	).toBeInTheDocument();
	expect(
		within(stoppedStep).getByText("no checkpoint saved"),
	).toBeInTheDocument();
}
