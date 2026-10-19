import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import AnalysisReadingBuilder from "#client/test-support/analysis-reading-test-builder";
import LiveReply from "#client/test-support/live-reply";
import {
	ANALYSES,
	CORPUS,
	RUN,
	serveContribution,
	stoppedRow,
} from "#client/test-support/run-detail";

import {
	originalFetch,
	rootCauseSection,
} from "./analysis-request-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe("requesting a root-cause analysis", () => {
	it(
		"shows the analysis once the one in flight records it",
		showsTheAnalysisOnceTheOneInFlightRecordsIt,
	);

	describe("when the server refuses the request", () => {
		it("shows the server's refusal", showsTheServerSRefusal);
	});

	describe("when no spend limit allows a request", () => {
		it(
			"refuses before the click",
			refusesBeforeTheClickWhenNoSpendLimitAllowsARequest,
		);
	});

	describe("when the run itself has not ended", () => {
		it(
			"refuses before the click",
			refusesBeforeTheClickWhileTheRunItselfHasNotEnded,
		);
	});

	describe("when an analysis of this run is in flight", () => {
		it("waits for the analysis", waitsWhileAnAnalysisOfThisRunIsInFlight);
	});
});

async function showsTheServerSRefusal(): Promise<void> {
	serveContribution(
		new Map([
			[
				"POST /api/launches",
				{ body: { error: "the run is still in flight" }, status: 409 },
			],
		]),
	);

	fireEvent.click(
		await within(await rootCauseSection()).findByRole("button", {
			name: "Request a root-cause analysis · at most $1.00",
		}),
	);

	expect(await screen.findByRole("alert")).toHaveTextContent(
		"the run is still in flight",
	);
}

async function refusesBeforeTheClickWhenNoSpendLimitAllowsARequest(): Promise<void> {
	serveContribution(
		new Map([
			[
				`GET ${ANALYSES}`,
				{
					body: new AnalysisReadingBuilder({
						request: {
							capUsd: null,
							model: "sonnet",
							refusal: "Set a spend limit before requesting an analysis.",
						},
					})
						.withoutAnalysis()
						.build(),
					status: 200,
				},
			],
		]),
	);

	const section = await rootCauseSection();

	expect(
		await within(section).findByText(
			"Set a spend limit before requesting an analysis.",
		),
	).toBeInTheDocument();
	expect(
		within(section).getByRole("button", {
			name: /^Request a root-cause analysis/u,
		}),
	).toHaveAttribute("aria-disabled", "true");
}

async function refusesBeforeTheClickWhileTheRunItselfHasNotEnded(): Promise<void> {
	serveContribution(
		new Map(),
		new NamedHistoryBuilder({
			rows: [
				{
					...new PipelineRunRowBuilder({
						corpusVersion: { digest: CORPUS, kind: "version" },
						run: RUN,
						status: "RUNNING",
					})
						.withExecutionProgress()
						.build(),
					shortId: "r-0147",
				},
			],
		}).build(),
	);

	const section = await rootCauseSection();

	expect(
		await within(section).findByText(
			"An analysis reads an ended run, and this one has not ended.",
		),
	).toBeInTheDocument();
	expect(
		within(section).getByRole("button", {
			name: /^Request a root-cause analysis/u,
		}),
	).toHaveAttribute("aria-disabled", "true");
}

async function waitsWhileAnAnalysisOfThisRunIsInFlight(): Promise<void> {
	serveContribution(new Map(), {
		...new NamedHistoryBuilder({ rows: [stoppedRow()] }).build(),
		launches: [
			{
				attempts: 1,
				caseId: undefined,
				id: "l-1",
				kind: "launch",
				launchedAt: "2026-09-28T10:50:00.000Z",
				run: RUN,
				stage: undefined,
				status: "RUNNING",
				target: "analysis",
			},
		],
	});

	const section = await rootCauseSection();

	expect(
		await within(section).findByText("An analysis of this run is in flight."),
	).toBeInTheDocument();
	expect(
		within(section).getByRole("button", {
			name: /^Request a root-cause analysis/u,
		}),
	).toHaveAttribute("aria-disabled", "true");
}

async function showsTheAnalysisOnceTheOneInFlightRecordsIt(): Promise<void> {
	let recorded = false;
	const waiting = new AnalysisReadingBuilder().withoutAnalysis().build();
	const ended = new NamedHistoryBuilder({ rows: [stoppedRow()] }).build();
	const running = {
		...ended,
		launches: [
			{
				attempts: 1,
				caseId: undefined,
				id: "l-1",
				kind: "launch",
				launchedAt: "2026-09-28T10:50:00.000Z",
				run: RUN,
				stage: undefined,
				status: "RUNNING",
				target: "analysis",
			} as const,
		],
	};
	const analyses = new LiveReply(() => ({
		body: recorded ? new AnalysisReadingBuilder().build() : waiting,
		status: 200,
	}));

	const runHistory = new LiveReply(() => ({
		body: recorded ? ended : running,
		status: 200,
	}));

	serveContribution(
		new Map([
			["GET /api/runs", runHistory],
			[`GET ${ANALYSES}`, analyses],
		]),
	);

	await within(await rootCauseSection()).findByText(
		"An analysis of this run is in flight.",
	);
	recorded = true;

	expect(
		await within(await rootCauseSection()).findByText(
			"Build skipped the scope declaration the shape step asked for.",
			undefined,
			{ timeout: 5000 },
		),
	).toBeInTheDocument();
}
