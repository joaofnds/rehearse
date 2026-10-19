import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import {
	RUN,
	renderRunDetail,
	stoppedAtBuild,
	stoppedRow,
} from "#client/test-support/run-detail";

import { originalFetch } from "./run-detail-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("/runs/$run", () => {
	it(
		"names the run, its case and how it ended in the header",
		namesTheRunItsCaseAndHowItEndedInTheHeader,
	);

	it(
		"labels header resources while keeping exact setup in its provenance disclosure",
		labelsHeaderResourcesWhileKeepingExactSetupInItsProvenanceDisclosure,
	);
	it("opens exact setup resources in provenance", readsExactRunSetupProvenance);

	it(
		"states execution, final result and pending human review independently without repeating the review state",
		statesExecutionFinalResultAndPendingHumanReviewIndependentlyWithoutRepeatingTheReviewState,
	);

	it(
		"links the primary final-outcome action to its retained target when the assessment is unavailable",
		linksThePrimaryFinalOutcomeActionToItsRetainedTargetWhenTheAssessmentIsUnavailable,
	);
});

async function namesTheRunItsCaseAndHowItEndedInTheHeader(): Promise<void> {
	renderRunDetail();

	const heading = await screen.findByRole("heading", { level: 1 });
	const header = heading.closest("header");

	expect(heading).toHaveTextContent("r-0147");
	expect(
		within(header ?? document.body).getByRole("link", { name: "audit-log" }),
	).toHaveAttribute("href", "/cases?caseId=audit-log");
	expect(header).toHaveTextContent("stopped at step 2 · below minimum B");
	expect(header).toHaveTextContent("corpus@a41c7e");
}

async function labelsHeaderResourcesWhileKeepingExactSetupInItsProvenanceDisclosure(): Promise<void> {
	const record = stoppedAtBuild();
	renderRunDetail(
		new Map([
			[
				`/api/runs/${RUN}`,
				{
					...record,
					identity: {
						...record.identity,
						commit: "abcdef1234567890",
						effort: "high",
						model: "recorded-model",
						target: "/workspace/a-long-target-repository",
					},
				},
			],
		]),
	);

	const heading = await screen.findByRole("heading", { level: 1 });
	const header = heading.closest("header");

	expect(header).toHaveTextContent(/Time /u);
	expect(header).toHaveTextContent(/Cost /u);
	expect(header).not.toHaveTextContent("/workspace/a-long-target-repository");
	expect(header).not.toHaveTextContent("recorded-model");
}

async function readsExactRunSetupProvenance(): Promise<void> {
	const record = stoppedAtBuild();
	renderRunDetail(
		new Map([
			[
				`/api/runs/${RUN}`,
				{
					...record,
					identity: {
						...record.identity,
						commit: "abcdef1234567890",
						effort: "high",
						model: "recorded-model",
						target: "/workspace/a-long-target-repository",
					},
				},
			],
		]),
	);
	await screen.findByRole("heading", { level: 1 });

	fireEvent.click(screen.getByText("Run setup & provenance"));
	const setup = screen.getByRole("region", {
		name: "Run setup & provenance",
	});
	expect(setup).toHaveTextContent(
		"/workspace/a-long-target-repository @ abcdef1234567890",
	);
	expect(setup).toHaveTextContent("recorded-model / high");
}

async function statesExecutionFinalResultAndPendingHumanReviewIndependentlyWithoutRepeatingTheReviewState(): Promise<void> {
	const fetchReplies = new Map<string, unknown>([
		[
			"/api/runs",
			new NamedHistoryBuilder({
				rows: [{ ...stoppedRow(), status: "AWAITING_HUMAN_REVIEW" }],
			}).build(),
		],
		[
			`/api/runs/${RUN}`,
			{
				...stoppedAtBuild(),
				finalOutcome: { status: "JUDGED", verdict: "FAIL" },
			},
		],
	]);
	renderRunDetail(fetchReplies);

	const heading = await screen.findByRole("heading", { level: 1 });
	const header = heading.closest("header");

	expect(header).toHaveTextContent("Execution ended");
	expect(header).toHaveTextContent("Final result: FAIL");
	expect(header).toHaveTextContent("Human review: pending");
	expect(header).not.toHaveTextContent("awaiting human review");
}

async function linksThePrimaryFinalOutcomeActionToItsRetainedTargetWhenTheAssessmentIsUnavailable(): Promise<void> {
	renderRunDetail(
		new Map<string, unknown>([
			[
				`/api/runs/${RUN}`,
				{
					...stoppedAtBuild(),
					finalOutcome: { status: "JUDGED", verdict: "FAIL" },
				},
			],
			[
				`/api/runs/${RUN}/final/assessment`,
				{
					reason: "Final assessment was not retained.",
					state: "unavailable",
				},
			],
		]),
	);

	const action = await screen.findByRole("link", {
		name: "Review final outcome",
	});
	const href = action.getAttribute("href");
	expect(href).toBe("#task-grade-label");
	expect(
		document.querySelector(href ?? "#missing-final-outcome-target"),
	).toBeInTheDocument();
}
