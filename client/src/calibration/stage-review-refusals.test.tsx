import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor } from "@testing-library/react";

import RecordNotFoundError from "#client/record-not-found";
import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";
import { SHELL_BASELINE, renderAppAt } from "#client/test-support/render-app";

import StageReviewPage from "./stage-review-page";
import { stageReviewQuery } from "./stage-review-query";
import {
	BLIND_REVIEW,
	REVIEW_PATH,
	RUN,
	choose,
	originalFetch,
	serving,
} from "./stage-review-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(StageReviewPage.name, () => {
	describe("when the link names no stage the Judge graded", () => {
		it(
			"answers that the record is not there, which the app does not retry",
			answersThatTheRecordIsNotThereWhichTheAppDoesNotRetry,
		);
	});

	describe("when something other than the route refuses the grade", () => {
		it("shows what it sent back", showsWhatItSentBack);
	});

	describe("when the server refuses the grade", () => {
		it("says why", saysWhy);
	});
});

function answersThatTheRecordIsNotThereWhichTheAppDoesNotRetry(): void {
	serving(BLIND_REVIEW);

	const loaded = stageReviewQuery({
		kind: "run",
		run: RUN,
		stage: "unjudged",
	}).queryFn();

	expect(loaded).rejects.toBeInstanceOf(RecordNotFoundError);
}

async function showsWhatItSentBack(): Promise<void> {
	const server = new FakeServer(
		new Map<string, Reply>([
			...[...SHELL_BASELINE].map(([path, body]): [string, Reply] => [
				`GET ${path}`,
				{ body, status: 200 },
			]),
			[`GET ${REVIEW_PATH}`, { body: BLIND_REVIEW, status: 200 }],
			[
				`POST ${REVIEW_PATH}/grade`,
				{ body: "Cross-origin request refused", status: 403 },
			],
		]),
	);
	server.install();
	renderAppAt(`/calibration/runs/${RUN}/stages/shape`);
	await screen.findByRole("region", { name: "What the judge read" });

	choose("invalid-stage-delivery", "PASS");
	choose("goal-stated", "PASS");
	choose("decision-quality", "B");
	fireEvent.click(screen.getByRole("button", { name: "Record my grade" }));

	await waitFor(() => {
		expect(screen.getByRole("alert")).toHaveTextContent(
			"Cross-origin request refused",
		);
	});
}

async function saysWhy(): Promise<void> {
	const server = new FakeServer(
		new Map<string, Reply>([
			...[...SHELL_BASELINE].map(([path, body]): [string, Reply] => [
				`GET ${path}`,
				{ body, status: 200 },
			]),
			[`GET ${REVIEW_PATH}`, { body: BLIND_REVIEW, status: 200 }],
			[
				`POST ${REVIEW_PATH}/grade`,
				{
					body: { error: "The operator already graded this stage" },
					status: 409,
				},
			],
		]),
	);
	server.install();
	renderAppAt(`/calibration/runs/${RUN}/stages/shape`);
	await screen.findByRole("region", { name: "What the judge read" });

	choose("invalid-stage-delivery", "PASS");
	choose("goal-stated", "PASS");
	choose("decision-quality", "B");
	fireEvent.click(screen.getByRole("button", { name: "Record my grade" }));

	await waitFor(() => {
		expect(screen.getByRole("alert")).toHaveTextContent(
			"The operator already graded this stage",
		);
	});
}
