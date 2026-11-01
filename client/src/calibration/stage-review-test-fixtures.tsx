import { fireEvent, screen, within } from "@testing-library/react";

import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";
import LiveReply from "#client/test-support/live-reply";
import { SHELL_BASELINE } from "#client/test-support/render-app";

import type { CalibrationResponse } from "./calibration-query";
import type { GradeRecorded, StageReview } from "./stage-review-query";

const NO_RECORDED_REVIEWS = 0;

const PENDING_REVIEW_COUNT = 1;

const NO_PENDING_REVIEWS = 0;

const RECORDED_REVIEW_COUNT = 1;

const TABLE_HEADER_ROW_COUNT = 1;

const originalFetch = globalThis.fetch;

const RUN = "2026-10-01T10-00-00.000Z";

const REVIEW_PATH = `/api/calibration/runs/${RUN}/stages/shape`;

const JUDGE_SUMMARY = "Judge summary: decisions are framed but not ordered";

const BLIND_REVIEW: StageReview = {
	criteria: {
		dimensions: [
			{
				description: "How well decisions are framed.",
				excellent: "A orders them by consequence.",
				good: "B frames each decision.",
				id: "decision-quality",
			},
		],
		hardBlockers: [
			{
				description: "The stage left no valid task state.",
				id: "invalid-stage-delivery",
			},
		],
		requirements: [
			{ description: "The task states its goal.", id: "goal-stated" },
		],
	},
	input: {
		task: "Implement the audit log",
		transcript: "the stage's transcript",
	},
	judgeModel: "opus",
	stage: { kind: "run", run: RUN, stage: "shape" },
	stageName: "shape",
};

const JUDGE_GRADE: GradeRecorded["judgeGrade"] = {
	dimensions: [{ evidence: [], grade: "D", id: "decision-quality" }],
	grade: "D",
	hardBlockers: [
		{ evidence: [], id: "invalid-stage-delivery", status: "PASS" },
	],
	requirements: [{ evidence: [], id: "goal-stated", status: "FAIL" }],
	summary: JUDGE_SUMMARY,
};

const RECORDED: GradeRecorded = {
	judgeGrade: JUDGE_GRADE,
	operatorGrade: {
		dimensions: [{ grade: "B", id: "decision-quality" }],
		grade: "B",
		hardBlockers: [{ id: "invalid-stage-delivery", status: "PASS" }],
		note: "the order is implied by the slices",
		requirements: [{ id: "goal-stated", status: "PASS" }],
	},
};

function serving(
	review: StageReview,
	reviewPath: string = REVIEW_PATH,
): FakeServer {
	const routes = new Map<string, Reply>([
		...[...SHELL_BASELINE].map(([path, body]): [string, Reply] => [
			`GET ${path}`,
			{ body, status: 200 },
		]),
		[`GET ${reviewPath}`, { body: review, status: 200 }],
		[`POST ${reviewPath}/grade`, { body: RECORDED, status: 201 }],
	]);
	const server = new FakeServer(routes);
	server.install();

	return server;
}

function choose(group: string, value: string): void {
	fireEvent.click(
		within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", {
			name: value,
		}),
	);
}

function fullSavedInput(): StageReview {
	return {
		...BLIND_REVIEW,
		input: {
			...BLIND_REVIEW.input,
			artifact: "Saved stage output",
			customEvidence: "A retained custom source",
			instructions: "Follow the saved instructions",
		},
		judgeGrade: JUDGE_GRADE,
	};
}

function recordedCalibrationReport(reviews: number): CalibrationResponse {
	return {
		excludedUnknownJudgeReviews: 0,
		groups: [],
		next: { kind: "run", run: RUN, stage: "shape" },
		reviews,
		rows:
			reviews === NO_RECORDED_REVIEWS
				? []
				: [
						{
							differences: [],
							judgeGrade: "D",
							judgeModel: "opus",
							note: "new saved grade",
							operatorGrade: "B",
							stage: { kind: "run", run: RUN, stage: "shape" },
							stageName: "shape",
							stepsApart: 2,
						},
					],
		ungraded:
			reviews === NO_RECORDED_REVIEWS
				? PENDING_REVIEW_COUNT
				: NO_PENDING_REVIEWS,
		withinOneStep: 0,
	};
}

function servingCalibrationWrite(): void {
	let recorded = false;

	const server = new FakeServer(
		new Map<string, Reply | LiveReply>([
			...[...SHELL_BASELINE].map(
				([path, body]) => [`GET ${path}`, { body, status: 200 }] as const,
			),
			[
				"GET /api/calibration",
				new LiveReply(() => ({
					body: recordedCalibrationReport(
						recorded ? RECORDED_REVIEW_COUNT : NO_RECORDED_REVIEWS,
					),
					status: 200,
				})),
			],
			[`GET ${REVIEW_PATH}`, { body: BLIND_REVIEW, status: 200 }],
			[
				`POST ${REVIEW_PATH}/grade`,
				new LiveReply(() => {
					recorded = true;
					return { body: RECORDED, status: 201 };
				}),
			],
		]),
	);
	server.install();
}

export {
	BLIND_REVIEW,
	choose,
	fullSavedInput,
	JUDGE_GRADE,
	JUDGE_SUMMARY,
	NO_PENDING_REVIEWS,
	NO_RECORDED_REVIEWS,
	originalFetch,
	PENDING_REVIEW_COUNT,
	RECORDED,
	RECORDED_REVIEW_COUNT,
	REVIEW_PATH,
	RUN,
	serving,
	servingCalibrationWrite,
	TABLE_HEADER_ROW_COUNT,
};
