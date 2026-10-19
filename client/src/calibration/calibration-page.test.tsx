import { afterEach, describe, expect, it } from "bun:test";

import { screen, within } from "@testing-library/react";

import CalibrationPage from "./calibration-page";
import {
	RUN,
	TABLE_HEADER_ROW_COUNT,
	differingGradeReport,
	originalFetch,
	renderCalibration,
	reportWith,
} from "./calibration-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(CalibrationPage.name, () => {
	it(
		"guides the first review and keeps agreement and drift unavailable until a review exists",
		guidesTheFirstReviewAndKeepsAgreementAndDriftUnavailableUntilAReviewExists,
	);

	it(
		"keeps the legacy Calibration route with its review summary",
		keepsTheLegacyCalibrationRouteWithItsReviewSummary,
	);

	it(
		"heads the screen with the reviews recorded and how many agree within one letter step",
		headsTheScreenWithTheReviewsRecordedAndHowManyAgreeWithinOneLetterStep,
	);

	it(
		"tabulates each graded step's two letters, their agreement and where they differed",
		tabulatesEachGradedStepSTwoLettersTheirAgreementAndWhereTheyDiffered,
	);
});

async function guidesTheFirstReviewAndKeepsAgreementAndDriftUnavailableUntilAReviewExists(): Promise<void> {
	renderCalibration(
		reportWith({
			next: { kind: "run", run: RUN, stage: "shape" },
			ungraded: 3,
		}),
	);
	expect(
		await screen.findByRole("region", {
			name: "Your first calibration review",
		}),
	).toHaveTextContent(
		"Judge's scores stay hidden until you record your grade.",
	);
	expect(screen.getByText("3 steps awaiting your review")).toBeInTheDocument();
	expect(
		screen.getByRole("link", { name: "Review next step" }),
	).toHaveAttribute("href", `/calibration/runs/${RUN}/stages/shape`);
	expect(screen.queryByRole("table")).not.toBeInTheDocument();
	expect(
		screen.queryByRole("complementary", { name: "Where the judge drifts" }),
	).not.toBeInTheDocument();
}

async function keepsTheLegacyCalibrationRouteWithItsReviewSummary(): Promise<void> {
	renderCalibration(reportWith({ reviews: 3, withinOneStep: 3 }));
	expect(
		await screen.findByRole("heading", { name: "Judge calibration" }),
	).toBeInTheDocument();
	expect(screen.getByText(/3 reviews recorded/u)).toBeInTheDocument();
}

async function headsTheScreenWithTheReviewsRecordedAndHowManyAgreeWithinOneLetterStep(): Promise<void> {
	renderCalibration(reportWith({ reviews: 41, withinOneStep: 34 }));

	const header = await screen.findByText(/reviews recorded/u);

	expect(header).toHaveTextContent(
		"41 reviews recorded · agreement within one letter step on 34/41 (83%)",
	);
}

async function tabulatesEachGradedStepSTwoLettersTheirAgreementAndWhereTheyDiffered(): Promise<void> {
	renderCalibration(differingGradeReport());

	const table = await screen.findByRole("table", {
		name: "Your grade against the judge's, same evidence",
	});
	const rows = within(table)
		.getAllByRole("row")
		.slice(TABLE_HEADER_ROW_COUNT)
		.map((row) =>
			[...row.querySelectorAll("th, td")].map((cell) => cell.textContent),
		);

	expect(
		within(table)
			.getAllByRole("columnheader")
			.map((cell) => cell.textContent),
	).toEqual(["Step", "Judge", "You", "Agreement", "Where you differed"]);
	expect(rows).toEqual([
		[`${RUN} · shape`, "B", "B", "✓exact", "—"],
		[
			`${RUN} · decompose`,
			"A",
			"B",
			"≈within 1 step",
			"clarity: judge A, you B",
		],
		[
			"audit replay · shape",
			"D",
			"B",
			"✕2 steps apart",
			"judge accepted an unverified claim",
		],
	]);
}
