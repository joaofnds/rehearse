import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import { SHELL_BASELINE, renderAppAt } from "#client/test-support/render-app";

import StageReviewPage from "./stage-review-page";
import {
	BLIND_REVIEW,
	JUDGE_SUMMARY,
	REVIEW_PATH,
	RUN,
	choose,
	fullSavedInput,
	originalFetch,
	serving,
} from "./stage-review-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(StageReviewPage.name, () => {
	it(
		"fetches the saved input without fetching judge values",
		readsOnlyBlindReviewMetadata,
	);
	it(
		"keeps scores hidden while reading every saved source",
		keepsJudgeScoresHiddenWithFullSavedInput,
	);
	it(
		"navigates the saved task, output, instructions and evidence while preserving blind grading",
		navigatesTheSavedTaskOutputInstructionsAndEvidenceWhilePreservingBlindGrading,
	);

	it(
		"shows the input the Judge read and every criterion to grade, and nothing the Judge returned",
		showsTheInputTheJudgeReadAndEveryCriterionToGradeAndNothingTheJudgeReturned,
	);

	it(
		"loads nothing the Judge returned while the operator fills in the form",
		loadsNothingTheJudgeReturnedWhileTheOperatorFillsInTheForm,
	);
});

async function navigatesTheSavedTaskOutputInstructionsAndEvidenceWhilePreservingBlindGrading(): Promise<void> {
	serving(fullSavedInput());
	renderAppAt(`/calibration/runs/${RUN}/stages/shape`);
	const navigation = await screen.findByRole("navigation", {
		name: "Review evidence sections",
	});
	for (const label of ["Task", "Output", "Instructions", "Evidence"]) {
		expect(
			within(navigation).getByRole("link", { name: label }),
		).toHaveAttribute("href", `#review-${label.toLowerCase()}`);
	}
	expect(screen.getByRole("region", { name: "Task" })).toHaveTextContent(
		"Implement the audit log",
	);
	expect(screen.getByRole("region", { name: "Output" })).toHaveTextContent(
		"Saved stage output",
	);
	expect(
		screen.getByRole("region", { name: "Instructions" }),
	).toHaveTextContent("Follow the saved instructions");
	expect(screen.getByRole("region", { name: "Evidence" })).toHaveTextContent(
		"A retained custom source",
	);
}

async function showsTheInputTheJudgeReadAndEveryCriterionToGradeAndNothingTheJudgeReturned(): Promise<void> {
	serving(BLIND_REVIEW);
	renderAppAt(`/calibration/runs/${RUN}/stages/shape`);

	const input = await screen.findByRole("region", {
		name: "What the judge read",
	});

	expect(
		within(input).getByText("Implement the audit log"),
	).toBeInTheDocument();
	expect(within(input).getByText("the stage's transcript")).toBeInTheDocument();
	expect(
		screen
			.getAllByRole("radiogroup")
			.map((group) => group.getAttribute("aria-label")),
	).toEqual(["invalid-stage-delivery", "goal-stated", "decision-quality"]);
	expect(screen.getByText("The task states its goal.")).toBeInTheDocument();
	expect(screen.queryByText(JUDGE_SUMMARY)).not.toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Record my grade" }),
	).toBeDisabled();
	expect(
		screen.getByRole("link", { name: "Back to run Results" }),
	).toHaveAttribute("href", `/runs/${RUN}?view=results&step=shape`);
}

async function loadsNothingTheJudgeReturnedWhileTheOperatorFillsInTheForm(): Promise<void> {
	const server = serving(BLIND_REVIEW);
	renderAppAt(`/calibration/runs/${RUN}/stages/shape`);
	await screen.findByRole("region", { name: "What the judge read" });

	choose("invalid-stage-delivery", "PASS");
	choose("goal-stated", "PASS");
	choose("decision-quality", "B");
	fireEvent.change(screen.getByLabelText("Where you differed (optional)"), {
		target: { value: "the order is implied by the slices" },
	});

	expect(
		new Set(server.sent.map(({ method, pathname }) => `${method} ${pathname}`)),
	).toEqual(
		new Set([
			...[...SHELL_BASELINE.keys()]
				.filter(
					(path) =>
						![
							"/api/runs",
							"/api/calibration",
							"/api/corpus",
							"/api/run-staleness",
						].includes(path),
				)
				.map((path) => `GET ${path}`),
			`GET ${REVIEW_PATH}`,
		]),
	);
}

async function keepsJudgeScoresHiddenWithFullSavedInput(): Promise<void> {
	const expectedRadioGroupCount = 3;
	serving(fullSavedInput());
	renderAppAt(`/calibration/runs/${RUN}/stages/shape`);
	await screen.findByRole("navigation", { name: "Review evidence sections" });
	expect(screen.queryByText(JUDGE_SUMMARY)).not.toBeInTheDocument();
	expect(screen.getAllByRole("radiogroup")).toHaveLength(
		expectedRadioGroupCount,
	);
	expect(screen.getByText("Awaiting your review")).toBeInTheDocument();
}

async function readsOnlyBlindReviewMetadata(): Promise<void> {
	const server = serving(BLIND_REVIEW);
	renderAppAt(`/calibration/runs/${RUN}/stages/shape`);
	await screen.findByRole("region", { name: "What the judge read" });
	expect(
		new Set(server.sent.map(({ method, pathname }) => `${method} ${pathname}`)),
	).toEqual(
		new Set([
			...[...SHELL_BASELINE.keys()]
				.filter(
					(path) =>
						![
							"/api/runs",
							"/api/calibration",
							"/api/corpus",
							"/api/run-staleness",
						].includes(path),
				)
				.map((path) => `GET ${path}`),
			`GET ${REVIEW_PATH}`,
		]),
	);
}
