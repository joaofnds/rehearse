import { afterEach, describe, expect, it } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";
import { renderAppAt, SHELL_BASELINE } from "#client/test-support/render-app";
import { RecordNotFoundError } from "#client/record-not-found";
import { StageReviewPage } from "./stage-review-page";
import type { GradeRecorded, StageReview } from "./stage-review-query";
import { stageReviewQuery } from "./stage-review-query";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const RUN = "2026-10-01T10-00-00.000Z";
const REVIEW_PATH = `/api/calibration/runs/${RUN}/stages/shape`;
const JUDGE_SUMMARY = "Judge summary: decisions are framed but not ordered";

const BLIND_REVIEW: StageReview = {
	stage: { kind: "run", run: RUN, stage: "shape" },
	stageName: "shape",
	judgeModel: "opus",
	criteria: {
		hardBlockers: [
			{
				id: "invalid-stage-delivery",
				description: "The stage left no valid task state.",
			},
		],
		requirements: [
			{ id: "goal-stated", description: "The task states its goal." },
		],
		dimensions: [
			{
				id: "decision-quality",
				description: "How well decisions are framed.",
				good: "B frames each decision.",
				excellent: "A orders them by consequence.",
			},
		],
	},
	input: {
		task: "Implement the audit log",
		transcript: "the stage's transcript",
	},
};

const JUDGE_GRADE: GradeRecorded["judgeGrade"] = {
	hardBlockers: [
		{ id: "invalid-stage-delivery", status: "PASS", evidence: [] },
	],
	requirements: [{ id: "goal-stated", status: "FAIL", evidence: [] }],
	dimensions: [{ id: "decision-quality", grade: "D", evidence: [] }],
	summary: JUDGE_SUMMARY,
	grade: "D",
};

const RECORDED: GradeRecorded = {
	operatorGrade: {
		hardBlockers: [{ id: "invalid-stage-delivery", status: "PASS" }],
		requirements: [{ id: "goal-stated", status: "PASS" }],
		dimensions: [{ id: "decision-quality", grade: "B" }],
		note: "the order is implied by the slices",
		grade: "B",
	},
	judgeGrade: JUDGE_GRADE,
};

function serving(review: StageReview): FakeServer {
	const routes = new Map<string, Reply>([
		...[...SHELL_BASELINE].map(([path, body]): [string, Reply] => [
			`GET ${path}`,
			{ status: 200, body },
		]),
		[`GET ${REVIEW_PATH}`, { status: 200, body: review }],
		[`POST ${REVIEW_PATH}/grade`, { status: 201, body: RECORDED }],
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

describe(StageReviewPage.name, () => {
	it("shows the input the Judge read and every criterion to grade, and nothing the Judge returned", async () => {
		const server = serving(BLIND_REVIEW);
		renderAppAt(`/calibration/runs/${RUN}/stages/shape`);

		const input = await screen.findByRole("region", {
			name: "What the judge read",
		});

		expect(
			within(input).getByText("Implement the audit log"),
		).toBeInTheDocument();
		expect(
			within(input).getByText("the stage's transcript"),
		).toBeInTheDocument();
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
			new Set(
				server.sent.map(({ method, pathname }) => `${method} ${pathname}`),
			),
		).toEqual(
			new Set([
				...[...SHELL_BASELINE.keys()].map((path) => `GET ${path}`),
				`GET ${REVIEW_PATH}`,
			]),
		);
	});

	it("records the operator's grade and then shows the Judge's beside it", async () => {
		const server = serving(BLIND_REVIEW);
		renderAppAt(`/calibration/runs/${RUN}/stages/shape`);
		await screen.findByRole("region", { name: "What the judge read" });

		choose("invalid-stage-delivery", "PASS");
		choose("goal-stated", "PASS");
		choose("decision-quality", "B");
		fireEvent.change(screen.getByLabelText("Where you differed (optional)"), {
			target: { value: "the order is implied by the slices" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Record my grade" }));

		const table = await screen.findByRole("table", {
			name: "Your grade against the judge's",
		});
		const rows = within(table)
			.getAllByRole("row")
			.slice(1)
			.map((row) =>
				[...row.querySelectorAll("th, td")].map((cell) => cell.textContent),
			);

		const [posted, ...more] = server.posted(`${REVIEW_PATH}/grade`);

		expect(more).toEqual([]);
		expect(JSON.parse(posted?.body ?? "null")).toEqual({
			hardBlockers: [{ id: "invalid-stage-delivery", status: "PASS" }],
			requirements: [{ id: "goal-stated", status: "PASS" }],
			dimensions: [{ id: "decision-quality", grade: "B" }],
			note: "the order is implied by the slices",
		});
		expect(rows).toEqual([
			["Step letter", "B", "D"],
			["invalid-stage-delivery", "PASS", "PASS"],
			["goal-stated", "PASS", "FAIL"],
			["decision-quality", "B", "D"],
		]);
		expect(screen.getByText(JUDGE_SUMMARY)).toBeInTheDocument();
	});

	it("asks for the stage the link names, a slash in it escaped rather than followed", async () => {
		const server = serving(BLIND_REVIEW);
		renderAppAt("/calibration/runs/a%2F..%2F..%2Freplays%2Fx/stages/shape");

		await waitFor(() => {
			expect(
				server.sent.some(({ pathname }) =>
					pathname.startsWith("/api/calibration/runs/a"),
				),
			).toBe(true);
		});

		expect(
			server.sent
				.map(({ pathname }) => pathname)
				.filter((pathname) => pathname.startsWith("/api/calibration/r")),
		).toEqual(["/api/calibration/runs/a%2F..%2F..%2Freplays%2Fx/stages/shape"]);
	});

	describe("when the operator already graded the step", () => {
		it("shows both grades without offering the form again", async () => {
			serving({
				...BLIND_REVIEW,
				operatorGrade: RECORDED.operatorGrade,
				judgeGrade: JUDGE_GRADE,
			});
			renderAppAt(`/calibration/runs/${RUN}/stages/shape`);

			await screen.findByRole("table", {
				name: "Your grade against the judge's",
			});

			expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
			expect(
				screen.queryByRole("button", { name: "Record my grade" }),
			).not.toBeInTheDocument();
		});
	});

	describe("when the link names no stage the Judge graded", () => {
		it("answers that the record is not there, which the app does not retry", async () => {
			serving(BLIND_REVIEW);

			const loaded = stageReviewQuery({
				kind: "run",
				run: RUN,
				stage: "unjudged",
			}).queryFn();

			await expect(loaded).rejects.toBeInstanceOf(RecordNotFoundError);
		});
	});

	describe("when something other than the route refuses the grade", () => {
		it("shows what it sent back", async () => {
			const server = new FakeServer(
				new Map<string, Reply>([
					...[...SHELL_BASELINE].map(([path, body]): [string, Reply] => [
						`GET ${path}`,
						{ status: 200, body },
					]),
					[`GET ${REVIEW_PATH}`, { status: 200, body: BLIND_REVIEW }],
					[
						`POST ${REVIEW_PATH}/grade`,
						{ status: 403, body: "Cross-origin request refused" },
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
		});
	});

	describe("when the server refuses the grade", () => {
		it("says why and keeps the Judge's grade hidden", async () => {
			const server = new FakeServer(
				new Map<string, Reply>([
					...[...SHELL_BASELINE].map(([path, body]): [string, Reply] => [
						`GET ${path}`,
						{ status: 200, body },
					]),
					[`GET ${REVIEW_PATH}`, { status: 200, body: BLIND_REVIEW }],
					[
						`POST ${REVIEW_PATH}/grade`,
						{
							status: 409,
							body: { error: "The operator already graded this stage" },
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
			expect(screen.queryByText(JUDGE_SUMMARY)).not.toBeInTheDocument();
		});
	});
});
