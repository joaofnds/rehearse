import { afterEach, describe, expect, it } from "bun:test";

import { screen } from "@testing-library/react";

import type { ArmFigures } from "#server/comparison-arm-figures";

import { ComparisonPage } from "./comparison-page";
import type { ComparisonResponseFixture } from "./comparison-page-test-fixtures";
import {
	PREFIX_START_INDEX,
	RETAINED_REPORT_CASE_COUNT,
	comparisonResponseBody,
	originalFetch,
	renderPage,
} from "./comparison-page-test-fixtures";
import { PASSED_EVERY_ATTEMPT } from "./comparison-report-test-fixtures";

const CHECKPOINT_RUN = "2026-09-28T10-03-07.498Z";

function oneCheckpointStageComparison(): ComparisonResponseFixture {
	const body = comparisonResponseBody();

	return {
		...body,
		armFigures: {
			"case-1": {
				baseline: PASSED_EVERY_ATTEMPT,
				candidate: PASSED_EVERY_ATTEMPT,
				control: PASSED_EVERY_ATTEMPT,
			},
		},
		checkpoint: { run: CHECKPOINT_RUN, stage: "shape", state: "available" },
		report: {
			cases: body.report.cases.slice(
				PREFIX_START_INDEX,
				RETAINED_REPORT_CASE_COUNT,
			),
			mode: "stage",
		},
	};
}

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(ComparisonPage.name, () => {
	describe("header", () => {
		it(
			"names the step and checkpoint of a one-checkpoint stage comparison",
			namesTheStepAndCheckpointOfAOneCheckpointStageComparison,
		);

		it(
			"names the checkpoint by its short id once its run holds one",
			namesTheCheckpointByItsShortIdOnceItsRunHoldsOne,
		);

		it(
			"names the mode and cases of a comparison that replays no single checkpoint",
			namesTheModeAndCasesOfAComparisonThatReplaysNoSingleCheckpoint,
		);

		it(
			"states the attempts per arm, what the arms share and their summed cost",
			statesTheAttemptsPerArmWhatTheArmsShareAndTheirSummedCost,
		);

		it(
			"shares only the cases between arms that replayed no single checkpoint",
			sharesOnlyTheCasesBetweenArmsThatReplayedNoSingleCheckpoint,
		);

		it(
			"states the fewest and most attempts when the arms hold different numbers",
			statesTheFewestAndMostAttemptsWhenTheArmsHoldDifferentNumbers,
		);

		it(
			"counts the arms that recorded no cost rather than adding a zero",
			countsTheArmsThatRecordedNoCostRatherThanAddingAZero,
		);
	});
});

async function namesTheModeAndCasesOfAComparisonThatReplaysNoSingleCheckpoint(): Promise<void> {
	renderPage();

	expect(
		await screen.findByRole("heading", {
			level: 1,
			name: "Comparison · session · case-1, case-2",
		}),
	).toBeInTheDocument();
}

async function sharesOnlyTheCasesBetweenArmsThatReplayedNoSingleCheckpoint(): Promise<void> {
	renderPage();

	expect(
		await screen.findByText("1 attempt per arm · same cases · $12.00 total"),
	).toBeInTheDocument();
}

async function statesTheFewestAndMostAttemptsWhenTheArmsHoldDifferentNumbers(): Promise<void> {
	const body = comparisonResponseBody();
	const [caseOne, caseTwo] = body.report.cases;
	if (caseOne === undefined || caseTwo === undefined) {
		throw new Error("Expected the fixture to hold two cases");
	}
	const { candidate } = caseTwo.arms;
	const [rep] = candidate.source.reps;
	if (rep === undefined) {
		throw new Error("Expected the fixture's arm to hold an attempt");
	}
	renderPage({
		...body,
		report: {
			...body.report,
			cases: [
				caseOne,
				{
					...caseTwo,
					arms: {
						...caseTwo.arms,
						candidate: {
							...candidate,
							source: {
								...candidate.source,
								reps: [rep, { ...rep, ordinal: 2, repId: "rep-2" }],
							},
						},
					},
				},
			],
		},
	});

	expect(
		await screen.findByText(
			"1 to 2 attempts per arm · same cases · $12.00 total",
		),
	).toBeInTheDocument();
}

async function countsTheArmsThatRecordedNoCostRatherThanAddingAZero(): Promise<void> {
	const body = comparisonResponseBody();
	const unrecorded: ArmFigures = {
		...PASSED_EVERY_ATTEMPT,
		cost: { reasons: ["rep-1 lacks worker cost"], state: "unavailable" },
	};
	renderPage({
		...body,
		armFigures: {
			...body.armFigures,
			"case-2": {
				baseline: PASSED_EVERY_ATTEMPT,
				candidate: PASSED_EVERY_ATTEMPT,
				control: unrecorded,
			},
		},
	});

	expect(
		await screen.findByText(
			"1 attempt per arm · same cases · $10.00 recorded · cost not recorded for 1 arm",
		),
	).toBeInTheDocument();
}

async function namesTheStepAndCheckpointOfAOneCheckpointStageComparison(): Promise<void> {
	renderPage(oneCheckpointStageComparison());

	expect(
		await screen.findByRole("heading", {
			level: 1,
			name: `Comparison · shape replay from run ${CHECKPOINT_RUN}`,
		}),
	).toBeInTheDocument();
}

async function namesTheCheckpointByItsShortIdOnceItsRunHoldsOne(): Promise<void> {
	const body = oneCheckpointStageComparison();
	renderPage({
		...body,
		checkpoint: {
			run: CHECKPOINT_RUN,
			shortId: "case-1/r4/s1",
			stage: "shape",
			state: "available",
		},
	});

	expect(
		await screen.findByRole("heading", {
			level: 1,
			name: "Comparison · shape replay at case-1/r4/s1",
		}),
	).toBeInTheDocument();
}

async function statesTheAttemptsPerArmWhatTheArmsShareAndTheirSummedCost(): Promise<void> {
	renderPage(oneCheckpointStageComparison());

	expect(
		await screen.findByText(
			"1 attempt per arm · same checkpoint, same case · $6.00 total",
		),
	).toBeInTheDocument();
}
