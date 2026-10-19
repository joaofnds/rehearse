import { afterEach, describe, expect, it } from "bun:test";

import { within } from "@testing-library/react";

import {
	DIGEST,
	card,
	originalFetch,
	pipelineCase,
	renderCasesAt,
	sessionCase,
} from "./case-page-fixtures";
import CasesPage from "./cases-page";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(CasesPage.name, () => {
	it(
		"shows a pipeline case's kind, target, figures, minimum grade, title and steps on its card",
		showsAPipelineCaseSKindTargetFiguresMinimumGradeTitleAndStepsOnItsCard,
	);

	it(
		"shows a session case with no repository, how many runs passed their checks, and its checks",
		showsASessionCaseWithNoRepositoryHowManyRunsPassedTheirChecksAndItsChecks,
	);

	describe("when a case never ran", neverRunCases);

	describe(
		"when the newest pipeline run recorded no minimum grade",
		missingMinimumGrade,
	);

	describe(
		"when no counted run was graded or costed",
		unmeasuredRunGradesAndCost,
	);

	describe(
		"when no counted session run had its checks run",
		unassessedSessionChecks,
	);

	describe("when the harness would refuse a case's pipeline", refusedPipeline);

	describe("when a case declares no model", undeclaredModel);
});

async function showsAPipelineCaseSKindTargetFiguresMinimumGradeTitleAndStepsOnItsCard(): Promise<void> {
	renderCasesAt("/cases", { cases: [pipelineCase()] });

	const pipeline = await card("audit-log");

	expect(within(pipeline).getByText("Workflow case")).toBeInTheDocument();
	expect(
		within(pipeline).getByText("../../../nest/template"),
	).toBeInTheDocument();
	expect(
		within(pipeline).getByText(
			"4 runs at corpus@e73e56 · median PASS of 3 graded · $3.50/run, 1 run without a cost",
		),
	).toBeInTheDocument();
	expect(
		within(pipeline).getByText(
			"2 runs left out, at another corpus version or none recorded",
		),
	).toBeInTheDocument();
	expect(
		within(pipeline).getByText(
			"Minimum grade B, as the newest pipeline run set it",
		),
	).toBeInTheDocument();
	expect(
		within(pipeline).getByText(
			"Asynchronous audit log module against the NestJS template",
		),
	).toBeInTheDocument();
	expect(within(pipeline).getByText("shape → build")).toBeInTheDocument();
	expect(
		within(pipeline).getByText("2 step rubrics + final-rubric.md"),
	).toBeInTheDocument();
}

async function showsASessionCaseWithNoRepositoryHowManyRunsPassedTheirChecksAndItsChecks(): Promise<void> {
	renderCasesAt("/cases", { cases: [sessionCase()] });

	const session = await card("brief-reply");

	expect(within(session).getByText("Session case")).toBeInTheDocument();
	expect(within(session).getByText("no repository")).toBeInTheDocument();
	expect(
		within(session).getByText(
			"3 runs at corpus@e73e56 · 2 of 3 passed their checks · $0.50/run",
		),
	).toBeInTheDocument();
	expect(
		within(session).getByText("word-band · forbidden-text"),
	).toBeInTheDocument();
	expect(within(session).queryByText(/median/u)).not.toBeInTheDocument();
	expect(within(session).queryByText(/Minimum grade/u)).not.toBeInTheDocument();
}

async function readsNoRunsRatherThanZeroFigures(): Promise<void> {
	renderCasesAt("/cases", {
		cases: [
			pipelineCase({
				figures: { state: "no-runs" },
				latestMinimumGrade: null,
			}),
		],
	});

	const pipeline = await card("audit-log");

	expect(within(pipeline).getByText("No runs yet")).toBeInTheDocument();
	expect(
		within(pipeline).queryByText(/Minimum grade/u),
	).not.toBeInTheDocument();
}

async function saysItIsNotRecorded(): Promise<void> {
	renderCasesAt("/cases", {
		cases: [pipelineCase({ latestMinimumGrade: { state: "not-recorded" } })],
	});

	expect(
		within(await card("audit-log")).getByText("Minimum grade not recorded"),
	).toBeInTheDocument();
}

async function saysSoRatherThanAFigure(): Promise<void> {
	renderCasesAt("/cases", {
		cases: [
			pipelineCase({
				figures: {
					corpusVersion: null,
					costPerRun: { costed: 0, lacking: 1, meanUsd: null },
					counted: 1,
					judged: 0,
					leftOut: 0,
					median: null,
					passed: 0,
					state: "measured",
				},
			}),
		],
	});

	expect(
		within(await card("audit-log")).getByText(
			"1 run, corpus version not recorded · no run graded · no cost recorded",
		),
	).toBeInTheDocument();
}

async function saysNoRunWasCheckedRatherThanNoneOfNonePassed(): Promise<void> {
	renderCasesAt("/cases", {
		cases: [
			sessionCase({
				figures: {
					corpusVersion: DIGEST,
					costPerRun: { costed: 1, lacking: 0, meanUsd: 0.5 },
					counted: 1,
					judged: 0,
					leftOut: 0,
					passed: 0,
					state: "measured",
				},
			}),
		],
	});

	expect(
		within(await card("brief-reply")).getByText(
			"1 run at corpus@e73e56 · no run checked · $0.50/run",
		),
	).toBeInTheDocument();
}

async function saysWhyItsStepsCannotBeShown(): Promise<void> {
	renderCasesAt("/cases", {
		cases: [
			pipelineCase({
				pipeline: {
					reason: "Pipeline stage build names a missing rubric: x.json",
					state: "unavailable",
				},
			}),
		],
	});

	expect(
		within(await card("audit-log")).getByText(
			"Pipeline stage build names a missing rubric: x.json",
		),
	).toBeInTheDocument();
}

function neverRunCases(): void {
	it(
		"reads no runs rather than zero figures",
		readsNoRunsRatherThanZeroFigures,
	);
}

function missingMinimumGrade(): void {
	it("says it is not recorded", saysItIsNotRecorded);
}

function unmeasuredRunGradesAndCost(): void {
	it("says so rather than a figure", saysSoRatherThanAFigure);
}

function unassessedSessionChecks(): void {
	it(
		"says no run was checked rather than none of none passed",
		saysNoRunWasCheckedRatherThanNoneOfNonePassed,
	);
}

function refusedPipeline(): void {
	it("says why its steps cannot be shown", saysWhyItsStepsCannotBeShown);
}

function undeclaredModel(): void {
	it.each(["Run once", "Run group"])(
		"draws %s disabled and says why",
		async (name) => {
			renderCasesAt("/cases", { cases: [pipelineCase({ model: null })] });

			const run = within(await card("audit-log")).getByRole("button", {
				name,
			});

			expect(run).toHaveAttribute("aria-disabled", "true");
			expect(run).toHaveAccessibleDescription(
				"Declares no model, so it cannot start",
			);
		},
	);
}
