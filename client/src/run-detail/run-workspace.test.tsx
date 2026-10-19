import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import {
	RUN,
	RunRecordStageBuilder,
	renderRunDetail,
	stoppedAtBuild,
} from "#client/test-support/run-detail";

import { originalFetch } from "./workspace-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("the run workspace", () => {
	it(
		"starts Results with compact workflow details and expands them on request",
		startsResultsWithCompactWorkflowDetailsAndExpandsThemOnRequest,
	);

	it(
		"keeps pending human review consistent with the run header",
		keepsPendingHumanReviewConsistentWithTheRunHeader,
	);

	it(
		"keeps a failed final outcome and pending human review free of an approval glyph in the header",
		keepsAFailedFinalOutcomeAndPendingHumanReviewFreeOfAnApprovalGlyphInTheHeader,
	);

	it(
		"leads with saved final failure criteria rather than inferring failure from a step letter",
		leadsWithSavedFinalFailureCriteriaRatherThanInferringFailureFromAStepLetter,
	);

	it(
		"shows the saved human verdict, summary and classified findings in Results",
		showsTheSavedHumanVerdictSummaryAndClassifiedFindingsInResults,
	);

	it(
		"labels a continued F by its minimum and keeps the independent failure separate",
		labelsAContinuedFByItsMinimumAndKeepsTheIndependentFailureSeparate,
	);

	it(
		"keeps an independent final FAIL beside Continued at minimum B step grades",
		keepsAnIndependentFinalFAILBesideContinuedAtMinimumBStepGrades,
	);
});

async function startsResultsWithCompactWorkflowDetailsAndExpandsThemOnRequest(): Promise<void> {
	renderRunDetail();

	const graph = await screen.findByRole("region", { name: "Task graph" });
	expect(graph).not.toHaveTextContent("checkpoint recorded");
	fireEvent.click(
		within(graph).getByRole("button", { name: "Show workflow details" }),
	);

	expect(graph).toHaveTextContent("checkpoint recorded");
	expect(
		within(graph).getByRole("button", { name: "Hide workflow details" }),
	).toBeInTheDocument();
}

async function keepsPendingHumanReviewConsistentWithTheRunHeader(): Promise<void> {
	const fetchReplies = new Map<string, unknown>([
		[
			"/api/runs",
			new NamedHistoryBuilder({
				rows: [
					new PipelineRunRowBuilder({
						run: RUN,
						status: "AWAITING_HUMAN_REVIEW",
					})
						.withExecutionProgress()
						.build(),
				],
			}).build(),
		],
	]);
	renderRunDetail(fetchReplies);

	expect(await screen.findByText(/Human review: pending/u)).toBeInTheDocument();
	expect(screen.getByText("Human review · pending")).toBeInTheDocument();
}

async function keepsAFailedFinalOutcomeAndPendingHumanReviewFreeOfAnApprovalGlyphInTheHeader(): Promise<void> {
	const fetchReplies = new Map<string, unknown>([
		[
			"/api/runs",
			new NamedHistoryBuilder({
				rows: [
					new PipelineRunRowBuilder({
						run: RUN,
						shortId: "r44",
						status: "AWAITING_HUMAN_REVIEW",
					})
						.withExecutionProgress()
						.build(),
				],
			}).build(),
		],
		[
			`/api/runs/${RUN}`,
			{
				...stoppedAtBuild(),
				finalOutcome: { status: "JUDGED", verdict: "FAIL" },
				status: { state: "available", status: "AWAITING_HUMAN_REVIEW" },
			},
		],
	]);
	renderRunDetail(fetchReplies);

	const heading = await screen.findByRole("heading", {
		level: 1,
		name: /r44/u,
	});
	const header = heading.closest("header");

	expect(header).toHaveTextContent("Execution ended");
	expect(header).toHaveTextContent(
		"Final result: FAIL · Human review: pending",
	);
	expect(header).toHaveTextContent("◌");
	expect(header).not.toHaveTextContent("✓");
}

async function leadsWithSavedFinalFailureCriteriaRatherThanInferringFailureFromAStepLetter(): Promise<void> {
	const base = stoppedAtBuild();
	renderRunDetail(
		new Map<string, unknown>([
			[
				`/api/runs/${RUN}`,
				{ ...base, finalOutcome: { status: "JUDGED", verdict: "FAIL" } },
			],
			[
				`/api/runs/${RUN}/final/assessment`,
				{
					requirements: [
						{
							evidence: [
								{
									claim: "The delivery omits hasMore",
									path: "delivery.diff",
									quote: "return { items: [] }",
									source: "diff",
								},
							],
							id: "empty-page",
							status: "FAIL",
						},
					],
					state: "available",
				},
			],
		]),
	);

	const criteria = await screen.findByRole("list", {
		name: "Failed final criteria",
	});

	expect(criteria).toHaveTextContent("The delivery omits hasMore");
	expect(within(criteria).getByRole("link")).toHaveAttribute(
		"href",
		`/runs/${RUN}/final/evidence/empty-page/0`,
	);
	expect(screen.getByRole("region", { name: "Next action" })).toHaveTextContent(
		"Inspect final evidence",
	);
}

async function showsTheSavedHumanVerdictSummaryAndClassifiedFindingsInResults(): Promise<void> {
	renderRunDetail(
		new Map([
			[
				`/api/runs/${RUN}`,
				{
					...stoppedAtBuild(),
					humanReview: {
						review: {
							findings: [
								{
									description: "The endpoint skips authorization.",
									judgeAssessment: "MISSED",
									paths: ["src/audit.ts"],
									rubricId: "authorization",
									stage: "build",
								},
							],
							summary: "The Judge missed the audit boundary.",
							verdict: "REJECT",
						},
						state: "available",
					},
				},
			],
		]),
	);

	const review = await screen.findByRole("region", { name: "Human review" });

	expect(review).toHaveTextContent("REJECT");
	expect(review).toHaveTextContent("The Judge missed the audit boundary.");
	expect(review).toHaveTextContent("The endpoint skips authorization.");
	expect(review).toHaveTextContent("build · MISSED · authorization");
	expect(review).toHaveTextContent("src/audit.ts");
}

async function labelsAContinuedFByItsMinimumAndKeepsTheIndependentFailureSeparate(): Promise<void> {
	const expectedMatchingElementsCount = 0;

	const record = stoppedAtBuild();
	renderRunDetail(
		new Map([
			[
				`/api/runs/${RUN}`,
				{
					...record,
					finalOutcome: { status: "JUDGED", verdict: "FAIL" },
					minimumGrade: { letter: "F", state: "available" },
					stages: [
						new RunRecordStageBuilder({
							grade: {
								letter: "F",
								reachesMinimum: true,
								state: "available",
								verdict: "CONTINUE",
							},
							stage: "build",
							status: "graded",
						}).build(),
					],
				},
			],
		]),
		[],
		`/runs/${RUN}?view=results&step=build`,
	);

	expect(await screen.findAllByText("Continued at minimum F")).not.toHaveLength(
		expectedMatchingElementsCount,
	);
	expect(
		screen.getByRole("region", {
			name: "Final outcome · independent task Judge",
		}),
	).toHaveTextContent("FAIL");
}

async function keepsAnIndependentFinalFAILBesideContinuedAtMinimumBStepGrades(): Promise<void> {
	const record = stoppedAtBuild();
	renderRunDetail(
		new Map([
			[
				`/api/runs/${RUN}`,
				{ ...record, finalOutcome: { status: "JUDGED", verdict: "FAIL" } },
			],
		]),
	);

	expect(
		await screen.findByRole("region", {
			name: "Final outcome · independent task Judge",
		}),
	).toHaveTextContent("FAIL");
	expect(
		within(screen.getByRole("region", { name: "Task graph" })).getByRole(
			"button",
			{ name: /^shape/u },
		),
	).toHaveTextContent("Continued at minimum B");
}
