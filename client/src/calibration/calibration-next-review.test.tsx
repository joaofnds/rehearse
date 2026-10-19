import { afterEach, describe, expect, it } from "bun:test";

import { screen } from "@testing-library/react";

import CalibrationPage from "./calibration-page";
import {
	RUN,
	originalFetch,
	renderCalibration,
	reportWith,
} from "./calibration-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(CalibrationPage.name, () => {
	it(
		"opens the oldest ungraded step from Review next step",
		opensTheOldestUngradedStepFromReviewNextStep,
	);

	it(
		"opens a replay's step from Review next step",
		opensAReplaySStepFromReviewNextStep,
	);

	describe("when no operator grade is recorded", () => {
		it(
			"reads zero reviews without an agreement figure and still opens a step",
			readsZeroReviewsWithoutAnAgreementFigureAndStillOpensAStep,
		);
	});

	describe("when no step the Judge graded is recorded", () => {
		it(
			"says so rather than calling every step graded",
			saysSoRatherThanCallingEveryStepGraded,
		);
	});

	describe("when every judged step is graded", () => {
		it("offers no step to review", offersNoStepToReview);
	});
});

async function opensTheOldestUngradedStepFromReviewNextStep(): Promise<void> {
	renderCalibration(
		reportWith({
			next: {
				groupId: "group-1",
				kind: "rep",
				repId: "rep-2",
				stage: "shape",
			},
			ungraded: 31,
		}),
	);

	const review = await screen.findByRole("link", {
		name: "Review next step",
	});

	expect(review).toHaveAttribute(
		"href",
		"/calibration/groups/group-1/reps/rep-2/stages/shape",
	);
}

async function opensAReplaySStepFromReviewNextStep(): Promise<void> {
	renderCalibration(
		reportWith({
			next: { kind: "replay", lineage: "lineage-1", timestamp: RUN },
			ungraded: 1,
		}),
	);

	const review = await screen.findByRole("link", {
		name: "Review next step",
	});

	expect(review).toHaveAttribute(
		"href",
		`/calibration/replays/lineage-1/${RUN}`,
	);
}

async function readsZeroReviewsWithoutAnAgreementFigureAndStillOpensAStep(): Promise<void> {
	renderCalibration(
		reportWith({
			next: { kind: "run", run: RUN, stage: "shape" },
			ungraded: 31,
		}),
	);

	const header = await screen.findByText(/reviews recorded/u);

	expect(header).toHaveTextContent(/^0 reviews recorded$/u);
	expect(
		screen.getByRole("link", { name: "Review next step" }),
	).toHaveAttribute("href", `/calibration/runs/${RUN}/stages/shape`);
}

async function saysSoRatherThanCallingEveryStepGraded(): Promise<void> {
	renderCalibration(reportWith({ next: null, reviews: 0, ungraded: 0 }));

	const button = await screen.findByRole("button", {
		name: "Review next step",
	});

	expect(button).toBeDisabled();
	expect(
		screen.getByText("No step the judge graded is recorded yet."),
	).toBeInTheDocument();
	expect(
		screen.queryByText("Every judged step has your review."),
	).not.toBeInTheDocument();
}

async function offersNoStepToReview(): Promise<void> {
	renderCalibration(reportWith({ reviews: 1, withinOneStep: 1 }));

	const button = await screen.findByRole("button", {
		name: "Review next step",
	});

	expect(button).toBeDisabled();
	expect(
		screen.getByText("Every judged step has your review."),
	).toBeInTheDocument();
}
