import { describe, expect, it } from "bun:test";

import { screen } from "@testing-library/react";

import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";

import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";

async function testKeepsEndedExecutionFinalFailureAndPendingHumanReviewSeparate(): Promise<void> {
	respondingWith({
		launches: [],
		rows: [
			{
				...new PipelineRunRowBuilder({
					run: "2026-10-15T12-00-00.000Z",
					shortId: "r44",
					status: "AWAITING_HUMAN_REVIEW",
				})
					.withExecutionProgress()
					.build(),
				finalOutcome: { state: "available", status: "JUDGED", verdict: "FAIL" },
			},
		],
		unreadable: [],
	});
	renderPage();

	const ended = await screen.findByText("Execution ended");
	expect(ended.closest("td")).toHaveTextContent("Human review pending");
	expect(ended.closest("td")).toHaveTextContent("Final outcome FAIL");
	expect(ended.closest("td")).not.toHaveTextContent("running");
}

registerRunHistoryTestCleanup();

describe("ended runs awaiting human review", () => {
	it(
		"keeps ended execution, final failure and pending human review separate",
		testKeepsEndedExecutionFinalFailureAndPendingHumanReviewSeparate,
	);
});
