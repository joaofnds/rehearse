import { afterEach, describe, expect, it } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { RunListingResponse } from "#client/run-history/run-history-query";
import { UNREAD_REPLAY_FIGURES } from "#client/test-support/run-figures";
import { LiveReply } from "#client/test-support/live-reply";
import type { CalibrationResponse } from "./calibration-query";
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

function serving(
	review: StageReview,
	reviewPath: string = REVIEW_PATH,
): FakeServer {
	const routes = new Map<string, Reply>([
		...[...SHELL_BASELINE].map(([path, body]): [string, Reply] => [
			`GET ${path}`,
			{ status: 200, body },
		]),
		[`GET ${reviewPath}`, { status: 200, body: review }],
		[`POST ${reviewPath}/grade`, { status: 201, body: RECORDED }],
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
	it("navigates the saved task, output, instructions and evidence while preserving blind grading", async () => {
		serving({
			...BLIND_REVIEW,
			judgeGrade: JUDGE_GRADE,
			input: {
				...BLIND_REVIEW.input,
				artifact: "Saved stage output",
				instructions: "Follow the saved instructions",
				customEvidence: "A retained custom source",
			},
		});
		renderAppAt(`/calibration/runs/${RUN}/stages/shape`);
		const navigation = await screen.findByRole("navigation", {
			name: "Review evidence sections",
		});
		for (const label of ["Task", "Output", "Instructions", "Evidence"]) {
			expect(
				within(navigation).getByRole("link", { name: label }),
			).toHaveAttribute("href", `#review-${label.toLowerCase()}`);
		}
		expect(screen.getByRole("region", { name: "Task" })).toHaveTextContent(
			"Implement the audit log",
		);
		expect(screen.getByRole("region", { name: "Output" })).toHaveTextContent(
			"Saved stage output",
		);
		expect(
			screen.getByRole("region", { name: "Instructions" }),
		).toHaveTextContent("Follow the saved instructions");
		expect(screen.getByRole("region", { name: "Evidence" })).toHaveTextContent(
			"A retained custom source",
		);
		expect(screen.queryByText(JUDGE_SUMMARY)).not.toBeInTheDocument();
		expect(screen.getAllByRole("radiogroup")).toHaveLength(3);
		expect(screen.getByText("Awaiting your review")).toBeInTheDocument();
	});
	it("leads replay review with its exact listed short identity and keeps canonical identity in inspectable provenance", async () => {
		const lineage = "a".repeat(64);
		const timestamp = RUN;
		const path = `/api/calibration/replays/${lineage}/${timestamp}`;
		const replay = {
			...UNREAD_REPLAY_FIGURES,
			kind: "replay",
			recordId: `attempt:stage:${lineage}/${timestamp}`,
			lineage,
			timestamp,
			shortId: "audit-log/r2",
			checkpointShortId: "audit-log/r1/s1",
			attempt: undefined,
			caseId: "audit-log",
			stage: "shape",
			grade: "B",
			status: "CONTINUE",
			corpusVersion: undefined,
			links: [],
		} satisfies RunListingResponse["rows"][number];
		const siblingTimestamp = "2026-10-01T09-00-00.000Z";
		const listing: RunListingResponse = {
			rows: [
				{
					...replay,
					recordId: `attempt:stage:${lineage}/${siblingTimestamp}`,
					timestamp: siblingTimestamp,
					shortId: "audit-log/r1",
				},
				replay,
			],
			launches: [],
			unreadable: [],
		};
		const server = new FakeServer(
			new Map<string, Reply>([
				...[...SHELL_BASELINE].map(([url, body]): [string, Reply] => [
					`GET ${url}`,
					{ status: 200, body },
				]),
				["GET /api/run-listing", { status: 200, body: listing }],
				[
					`GET ${path}`,
					{
						status: 200,
						body: {
							...BLIND_REVIEW,
							stage: { kind: "replay", lineage, timestamp },
						},
					},
				],
			]),
		);
		server.install();
		renderAppAt(`/calibration/replays/${lineage}/${timestamp}`);

		const heading = await screen.findByRole("heading", {
			level: 1,
			name: "Review step",
		});
		const header = heading.closest("header");
		await waitFor(() => {
			expect(header).toHaveTextContent(
				"r2 · audit-log · replay · shape · Judge opus",
			);
		});

		expect(header).not.toHaveTextContent(lineage);
		const summary = screen.getByText("Recorded step identity");
		const disclosure = summary.closest("details");
		expect(disclosure).not.toHaveAttribute("open");
		fireEvent.click(summary);
		expect(disclosure).toHaveAttribute("open");
		expect(screen.getByText(lineage)).toBeVisible();
		expect(disclosure).toHaveTextContent(timestamp);
		expect(screen.queryByText(JUDGE_SUMMARY)).not.toBeInTheDocument();
	});

	it("keeps a readable replay fallback and canonical identity when the listing is unavailable", async () => {
		const lineage = "b".repeat(64);
		const timestamp = RUN;
		const path = `/api/calibration/replays/${lineage}/${timestamp}`;
		const server = new FakeServer(
			new Map<string, Reply>([
				...[...SHELL_BASELINE].map(([url, body]): [string, Reply] => [
					`GET ${url}`,
					{ status: 200, body },
				]),
				[
					"GET /api/run-listing",
					{ status: 404, body: { error: "Listing unavailable" } },
				],
				[
					`GET ${path}`,
					{
						status: 200,
						body: {
							...BLIND_REVIEW,
							stage: { kind: "replay", lineage, timestamp },
						},
					},
				],
			]),
		);
		server.install();
		renderAppAt(`/calibration/replays/${lineage}/${timestamp}`);

		await screen.findByRole("region", { name: "What the judge read" });
		const header = screen.getByRole("heading", { level: 1 }).closest("header");

		expect(header).toHaveTextContent("Replay · shape · Judge opus");
		expect(header).not.toHaveTextContent(lineage);
		fireEvent.click(screen.getByText("Recorded step identity"));
		expect(screen.getByText(lineage)).toBeVisible();
		expect(screen.getAllByRole("radiogroup")).toHaveLength(3);
	});

	it("returns to Judge calibration from a contextual step review", async () => {
		serving(BLIND_REVIEW);
		renderAppAt(`/calibration/runs/${RUN}/stages/shape`);
		expect(
			await screen.findByRole("link", { name: "Judge calibration" }),
		).toHaveAttribute("href", "/settings?view=judges");
	});

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
			screen.getByRole("link", { name: "Back to run Results" }),
		).toHaveAttribute("href", `/runs/${RUN}?view=results&step=shape`);
		expect(
			new Set(
				server.sent.map(({ method, pathname }) => `${method} ${pathname}`),
			),
		).toEqual(
			new Set([
				...[...SHELL_BASELINE.keys()]
					.filter(
						(path) =>
							![
								"/api/runs",
								"/api/calibration",
								"/api/corpus",
								"/api/run-staleness",
							].includes(path),
					)
					.map((path) => `GET ${path}`),
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

	it("refreshes the saved calibration report after grading from Settings", async () => {
		let recorded = false;
		const report = (reviews: number): CalibrationResponse => ({
			reviews,
			withinOneStep: 0,
			ungraded: reviews === 0 ? 1 : 0,
			next: { kind: "run", run: RUN, stage: "shape" },
			rows:
				reviews === 0
					? []
					: [
							{
								stage: { kind: "run", run: RUN, stage: "shape" },
								stageName: "shape",
								judgeModel: "opus",
								judgeGrade: "D",
								operatorGrade: "B",
								stepsApart: 2,
								differences: [],
								note: "new saved grade",
							},
						],
			groups: [],
		});
		const server = new FakeServer(
			new Map<string, Reply | LiveReply>([
				...[...SHELL_BASELINE].map(
					([path, body]) => [`GET ${path}`, { status: 200, body }] as const,
				),
				[
					"GET /api/calibration",
					new LiveReply(() => ({
						status: 200,
						body: report(recorded ? 1 : 0),
					})),
				],
				[`GET ${REVIEW_PATH}`, { status: 200, body: BLIND_REVIEW }],
				[
					`POST ${REVIEW_PATH}/grade`,
					new LiveReply(() => {
						recorded = true;
						return { status: 201, body: RECORDED };
					}),
				],
			]),
		);
		server.install();
		renderAppAt("/settings?view=judges");
		fireEvent.click(await screen.findByRole("link", { name: /Review next/u }));
		await screen.findByRole("region", { name: "What the judge read" });
		choose("invalid-stage-delivery", "PASS");
		choose("goal-stated", "PASS");
		choose("decision-quality", "B");
		fireEvent.click(screen.getByRole("button", { name: "Record my grade" }));
		await screen.findByRole("table", {
			name: "Your grade against the judge's",
		});
		fireEvent.click(screen.getByRole("link", { name: "Judge calibration" }));
		expect(await screen.findByText("new saved grade")).toBeInTheDocument();
		expect(screen.getByText(/1 review recorded/u)).toBeInTheDocument();
	});

	it("loads nothing the Judge returned while the operator fills in the form", async () => {
		const server = serving(BLIND_REVIEW);
		renderAppAt(`/calibration/runs/${RUN}/stages/shape`);
		await screen.findByRole("region", { name: "What the judge read" });

		choose("invalid-stage-delivery", "PASS");
		choose("goal-stated", "PASS");
		choose("decision-quality", "B");
		fireEvent.change(screen.getByLabelText("Where you differed (optional)"), {
			target: { value: "the order is implied by the slices" },
		});

		expect(
			new Set(
				server.sent.map(({ method, pathname }) => `${method} ${pathname}`),
			),
		).toEqual(
			new Set([
				...[...SHELL_BASELINE.keys()]
					.filter(
						(path) =>
							![
								"/api/runs",
								"/api/calibration",
								"/api/corpus",
								"/api/run-staleness",
							].includes(path),
					)
					.map((path) => `GET ${path}`),
				`GET ${REVIEW_PATH}`,
			]),
		);
	});

	it("keeps the contextual return to the judged run after recording", async () => {
		const server = serving(BLIND_REVIEW);
		renderAppAt(`/calibration/runs/${RUN}/stages/shape`);
		await screen.findByRole("region", { name: "What the judge read" });

		choose("invalid-stage-delivery", "PASS");
		choose("goal-stated", "PASS");
		choose("decision-quality", "B");
		fireEvent.click(screen.getByRole("button", { name: "Record my grade" }));

		await screen.findByRole("table", {
			name: "Your grade against the judge's",
		});
		expect(server.posted(`${REVIEW_PATH}/grade`)).toHaveLength(1);
		expect(
			screen.getByRole("link", { name: "Back to run Results" }),
		).toHaveAttribute("href", `/runs/${RUN}?view=results&step=shape`);
	});

	it.each([
		[
			"a confirmation rep",
			"/calibration/groups/group-1/reps/rep-2/stages/shape",
			"/api/calibration/groups/group-1/reps/rep-2/stages/shape",
			"Back to attempt Results",
			"/groups/group-1/reps/rep-2/attempt?view=results",
		],
		[
			"a replay",
			`/calibration/replays/lineage-1/${RUN}`,
			`/api/calibration/replays/lineage-1/${RUN}`,
			"Back to replay Results",
			`/replays/lineage-1/${RUN}?view=results`,
		],
	])(
		"opens and records %s the link names",
		async (_kind, page, reviewPath, returnLabel, returnHref) => {
			const server = serving(BLIND_REVIEW, reviewPath);
			renderAppAt(page);
			await screen.findByRole("region", { name: "What the judge read" });

			choose("invalid-stage-delivery", "PASS");
			choose("goal-stated", "PASS");
			choose("decision-quality", "B");
			fireEvent.click(screen.getByRole("button", { name: "Record my grade" }));
			await screen.findByRole("table", {
				name: "Your grade against the judge's",
			});

			expect(server.posted(`${reviewPath}/grade`)).toHaveLength(1);
			expect(screen.getByRole("link", { name: returnLabel })).toHaveAttribute(
				"href",
				returnHref,
			);
		},
	);

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
		it("answers that the record is not there, which the app does not retry", () => {
			serving(BLIND_REVIEW);

			const loaded = stageReviewQuery({
				kind: "run",
				run: RUN,
				stage: "unjudged",
			}).queryFn();

			expect(loaded).rejects.toBeInstanceOf(RecordNotFoundError);
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
		it("says why", async () => {
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
		});
	});
});
