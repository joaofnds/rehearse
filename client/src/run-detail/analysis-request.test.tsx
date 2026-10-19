import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, waitFor, within } from "@testing-library/react";

import AnalysisReadingBuilder from "#client/test-support/analysis-reading-test-builder";
import {
	ANALYSES,
	RUN,
	serveContribution,
} from "#client/test-support/run-detail";

import {
	FIRST_POSTED_REQUEST_INDEX,
	originalFetch,
	rootCauseSection,
} from "./analysis-request-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe("requesting a root-cause analysis", () => {
	it(
		"says no analysis is recorded and states the most a request can spend before the click",
		saysNoAnalysisIsRecordedAndStatesTheMostARequestCanSpendBeforeTheClick,
	);

	it(
		"posts the run and the stated cap, then reads the analyses again",
		postsTheRunAndTheStatedCapThenReadsTheAnalysesAgain,
	);

	it(
		"re-runs a recorded analysis at the cap a request may spend now, not the one it ran under",
		reRunsARecordedAnalysisAtTheCapARequestMaySpendNowNotTheOneItRanUnder,
	);
});

async function saysNoAnalysisIsRecordedAndStatesTheMostARequestCanSpendBeforeTheClick(): Promise<void> {
	serveContribution(new Map());

	const section = await rootCauseSection();

	expect(
		await within(section).findByText(
			"No root-cause analysis is recorded for this run.",
		),
	).toBeInTheDocument();
	expect(section).toHaveTextContent(
		"A request makes one sonnet call that can spend at most $1.00.",
	);
	expect(
		within(section).getByRole("button", {
			name: "Request a root-cause analysis · at most $1.00",
		}),
	).toBeEnabled();
}

async function postsTheRunAndTheStatedCapThenReadsTheAnalysesAgain(): Promise<void> {
	const server = serveContribution(
		new Map([["POST /api/launches", { body: { id: "l-1" }, status: 201 }]]),
	);

	fireEvent.click(
		await within(await rootCauseSection()).findByRole("button", {
			name: "Request a root-cause analysis · at most $1.00",
		}),
	);

	await waitFor(() => {
		const expectedPostedCount = 1;

		expect(server.posted("/api/launches")).toHaveLength(expectedPostedCount);
	});
	await waitFor(() => {
		const lowerBoundForSentCount = 1;

		expect(
			server.sent.filter(
				({ method, pathname }) => method === "GET" && pathname === ANALYSES,
			).length,
		).toBeGreaterThan(lowerBoundForSentCount);
	});
	expect(
		JSON.parse(
			server.posted("/api/launches")[FIRST_POSTED_REQUEST_INDEX]?.body ?? "",
		),
	).toEqual({
		kind: "analysis",
		run: RUN,
		statedUsd: 1,
	});
}

async function reRunsARecordedAnalysisAtTheCapARequestMaySpendNowNotTheOneItRanUnder(): Promise<void> {
	const server = serveContribution(
		new Map([
			[
				`GET ${ANALYSES}`,
				{
					body: new AnalysisReadingBuilder({
						request: { capUsd: 2, model: "sonnet", refusal: null },
					}).build(),
					status: 200,
				},
			],
			["POST /api/launches", { body: { id: "l-1" }, status: 201 }],
		]),
	);

	fireEvent.click(
		await within(await rootCauseSection()).findByRole("button", {
			name: "Re-run the analysis · at most $2.00",
		}),
	);

	await waitFor(() => {
		const expectedPostedCount = 1;

		expect(server.posted("/api/launches")).toHaveLength(expectedPostedCount);
	});
	expect(
		JSON.parse(
			server.posted("/api/launches")[FIRST_POSTED_REQUEST_INDEX]?.body ?? "",
		),
	).toEqual({
		kind: "analysis",
		run: RUN,
		statedUsd: 2,
	});
}
