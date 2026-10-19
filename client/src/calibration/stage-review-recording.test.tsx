import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import type { FakeServer } from "#client/test-support/fetch-stub";
import { renderAppAt } from "#client/test-support/render-app";

import StageReviewPage from "./stage-review-page";
import {
	BLIND_REVIEW,
	JUDGE_GRADE,
	JUDGE_SUMMARY,
	RECORDED,
	REVIEW_PATH,
	RUN,
	TABLE_HEADER_ROW_COUNT,
	choose,
	originalFetch,
	serving,
	servingCalibrationWrite,
} from "./stage-review-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(StageReviewPage.name, () => {
	describe("after recording an operator grade", recordedOperatorGrade);

	describe("from a pending Settings review", settingsCalibrationWrite);

	describe("when the operator already graded the step", () => {
		it(
			"shows both grades without offering the form again",
			showsBothGradesWithoutOfferingTheFormAgain,
		);
	});
});

let recordingServer: FakeServer | null = null;
function recordedOperatorGrade(): void {
	beforeEach(recordOperatorGrade);
	it(
		"posts exactly the operator's complete grade and note",
		postsCompleteOperatorGrade,
	);
	it(
		"shows the judge's saved criteria and summary beside the operator's grade",
		showsRecordedGradeComparison,
	);
}
async function recordOperatorGrade(): Promise<void> {
	recordingServer = serving(BLIND_REVIEW);
	renderAppAt(`/calibration/runs/${RUN}/stages/shape`);
	await screen.findByRole("region", { name: "What the judge read" });
	choose("invalid-stage-delivery", "PASS");
	choose("goal-stated", "PASS");
	choose("decision-quality", "B");
	fireEvent.change(screen.getByLabelText("Where you differed (optional)"), {
		target: { value: "the order is implied by the slices" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Record my grade" }));
	await screen.findByRole("table", { name: "Your grade against the judge's" });
}
function postsCompleteOperatorGrade(): void {
	if (recordingServer === null) {
		throw new Error("The grade was not recorded");
	}
	const [posted, ...more] = recordingServer.posted(`${REVIEW_PATH}/grade`);
	expect(more).toEqual([]);
	expect(JSON.parse(posted?.body ?? "null")).toEqual({
		dimensions: [{ grade: "B", id: "decision-quality" }],
		hardBlockers: [{ id: "invalid-stage-delivery", status: "PASS" }],
		note: "the order is implied by the slices",
		requirements: [{ id: "goal-stated", status: "PASS" }],
	});
}
async function showsRecordedGradeComparison(): Promise<void> {
	const table = await screen.findByRole("table", {
		name: "Your grade against the judge's",
	});
	const rows = within(table)
		.getAllByRole("row")
		.slice(TABLE_HEADER_ROW_COUNT)
		.map((row) =>
			[...row.querySelectorAll("th, td")].map((cell) => cell.textContent),
		);
	expect(rows).toEqual([
		["Step letter", "B", "D"],
		["invalid-stage-delivery", "PASS", "PASS"],
		["goal-stated", "PASS", "FAIL"],
		["decision-quality", "B", "D"],
	]);
	expect(screen.getByText(JUDGE_SUMMARY)).toBeInTheDocument();
}

function settingsCalibrationWrite(): void {
	beforeEach(opensPendingSettingsReview);
	it(
		"refreshes the saved calibration report after grading from Settings",
		refreshesTheSettingsCalibration,
	);
}
async function opensPendingSettingsReview(): Promise<void> {
	servingCalibrationWrite();
	renderAppAt("/settings?view=judges");
	fireEvent.click(await screen.findByRole("link", { name: /Review next/u }));
	await screen.findByRole("region", { name: "What the judge read" });
}
async function refreshesTheSettingsCalibration(): Promise<void> {
	choose("invalid-stage-delivery", "PASS");
	choose("goal-stated", "PASS");
	choose("decision-quality", "B");
	fireEvent.click(screen.getByRole("button", { name: "Record my grade" }));
	await screen.findByRole("table", {
		name: "Your grade against the judge's",
	});
	fireEvent.click(screen.getByRole("link", { name: "Judge calibration" }));
	expect(await screen.findByText("new saved grade")).toBeInTheDocument();
	expect(screen.getByText(/1 review recorded/u)).toBeInTheDocument();
}

async function showsBothGradesWithoutOfferingTheFormAgain(): Promise<void> {
	serving({
		...BLIND_REVIEW,
		judgeGrade: JUDGE_GRADE,
		operatorGrade: RECORDED.operatorGrade,
	});
	renderAppAt(`/calibration/runs/${RUN}/stages/shape`);

	await screen.findByRole("table", {
		name: "Your grade against the judge's",
	});

	expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: "Record my grade" }),
	).not.toBeInTheDocument();
}
