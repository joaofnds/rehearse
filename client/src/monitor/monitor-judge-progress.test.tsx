import { afterEach, describe, expect, it, setSystemTime } from "bun:test";

import { waitFor, within } from "@testing-library/react";

import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import ListedStageGradeBuilder from "#client/test-support/listed-stage-grade-test-builder";

import {
	BUILD_JUDGE,
	RETURNING,
	judgePane,
	judgeRowReadings,
	qualityReadings,
	renderJudge,
} from "./monitor-judge-test-fixtures";
import { RUN, originalFetch, renderMonitor } from "./monitor-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
	setSystemTime();
});

describe("/monitor judge pane", () => {
	describe("while its judge is returning", () => {
		it(
			"names the judge grading as an independent session, with what it has cost so far",
			namesTheJudgeGradingAsAnIndependentSessionWithWhatItHasCostSoFar,
		);

		it(
			"shows the verdict and grade pending while the dimensions return",
			showsTheVerdictAndGradePendingWhileTheDimensionsReturn,
		);

		it(
			"lists every hard blocker, each returned one fired or clear and the rest pending, under how many were evaluated",
			listsEveryHardBlockerEachReturnedOneFiredOrClearAndTheRestPendingUnderHowManyWereEvaluated,
		);

		it(
			"lists every quality dimension, each returned one with its grade and the rest pending, under how many returned",
			listsEveryQualityDimensionEachReturnedOneWithItsGradeAndTheRestPendingUnderHowManyReturned,
		);

		it(
			"offers no evidence until the judge's record holds it",
			offersNoEvidenceUntilTheJudgeSRecordHoldsIt,
		);

		it(
			"reads the grade as one attempt, linking to the comparisons",
			readsTheGradeAsOneAttemptLinkingToTheComparisons,
		);
		it(
			"says how far identical reruns have graded the step apart",
			saysHowFarIdenticalRerunsHaveGradedTheStepApart,
		);
	});
});

async function namesTheJudgeGradingAsAnIndependentSessionWithWhatItHasCostSoFar(): Promise<void> {
	renderJudge(RETURNING);

	const pane = await judgePane();

	expect(await within(pane).findByText("grading")).toHaveClass(
		"text-accent-foreground",
	);
	expect(pane).toHaveTextContent("independent session · $0.08 so far");
}

async function showsTheVerdictAndGradePendingWhileTheDimensionsReturn(): Promise<void> {
	renderJudge(RETURNING);

	const card = await within(await judgePane()).findByRole("group", {
		name: "Verdict and grade",
	});

	expect(card).toHaveTextContent("Verdict◌pending: dimensions still returning");
	expect(card).toHaveTextContent("Grade—");
}

async function listsEveryHardBlockerEachReturnedOneFiredOrClearAndTheRestPendingUnderHowManyWereEvaluated(): Promise<void> {
	renderJudge(RETURNING);

	expect(await judgeRowReadings("Hard blockers")).toEqual([
		"✕no-unrelated-refactorsfiredevidence pending",
		"✓tests-pass-before-handoffclearevidence pending",
		"◌no-secrets-in-diffpendingevidence pending",
	]);
	expect(
		within(await judgePane()).getByRole("heading", {
			level: 3,
			name: /^Hard blockers/u,
		}),
	).toHaveTextContent("Hard blockers · 2 of 3 evaluated");
}

async function listsEveryQualityDimensionEachReturnedOneWithItsGradeAndTheRestPendingUnderHowManyReturned(): Promise<void> {
	renderJudge(RETURNING);

	expect(await qualityReadings()).toEqual([
		"scope-discipline▮▮▮▮▯Bevidence pending",
		"diff-hygiene▯▯▯▯▯—evidence pending",
	]);
	expect(
		within(await judgePane()).getByRole("heading", {
			level: 3,
			name: /^Quality dimensions/u,
		}),
	).toHaveTextContent("Quality dimensions · 1 of 2 returned");
}

async function offersNoEvidenceUntilTheJudgeSRecordHoldsIt(): Promise<void> {
	const expectedToggleCount = 5;

	renderJudge(RETURNING);

	await judgeRowReadings("Hard blockers");
	const toggles = within(await judgePane()).getAllByRole("button", {
		name: "evidence pending",
	});

	expect(toggles).toHaveLength(expectedToggleCount);
	for (const toggle of toggles) {
		expect(toggle).toHaveAttribute("aria-disabled", "true");
	}
}

async function readsTheGradeAsOneAttemptLinkingToTheComparisons(): Promise<void> {
	renderJudge(RETURNING);

	const note = await within(await judgePane()).findByRole("note");

	expect(note).toHaveTextContent(
		"Read this as one attempt" +
			"Fewer than two identical reruns of this case have graded this step, so how far its grade varies here is not known yet. " +
			"A single grade is a data point, not a score. Compare arms to say whether an edit moved anything.",
	);
	expect(
		within(note).getByRole("link", { name: "Compare arms" }),
	).toHaveAttribute("href", "/comparisons");
}

async function saysHowFarIdenticalRerunsHaveGradedTheStepApart(): Promise<void> {
	const version = {
		digest: "a".repeat(SHA256_HEX_CHARACTERS),
		kind: "version",
	} as const;
	const reruns = [
		{ letter: "B", run: "2026-09-01T10-00-00.000Z" },
		{ letter: "C", run: "2026-09-02T10-00-00.000Z" },
	].map(({ letter, run }) =>
		new PipelineRunRowBuilder({
			corpusVersion: version,
			run,
			stageGrades: {
				grades: [
					new ListedStageGradeBuilder({ stage: "build" })
						.graded({ letter })
						.build(),
				],
				state: "available",
			},
			status: "COMPLETED",
		})
			.withExecutionProgress()
			.build(),
	);
	const watched = new PipelineRunRowBuilder({
		corpusVersion: version,
		run: RUN,
	})
		.withExecutionProgress({ stage: "build", stageState: "judge grading" })
		.build();
	const fetchReplies = new Map<string, unknown>([
		[
			"/api/run-listing",
			new NamedHistoryBuilder({
				rows: [watched, ...reruns],
			}).build(),
		],
		[BUILD_JUDGE, RETURNING],
	]);
	renderMonitor(watched, fetchReplies);

	const note = await within(await judgePane()).findByRole("note");

	await waitFor(() => {
		expect(note).toHaveTextContent(
			"Identical reruns of this case have varied by one letter step here.",
		);
	});
}
