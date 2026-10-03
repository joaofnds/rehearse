import { afterEach, describe, expect, it } from "bun:test";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderAppWithStub } from "#client/test-support/render-app";
import { CalibrationPage } from "./calibration-page";
import type { CalibrationResponse } from "./calibration-query";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

type AgreementRow = CalibrationResponse["rows"][number];

const RUN = "2026-10-01T10-00-00.000Z";

function reportWith(report: Partial<CalibrationResponse>): CalibrationResponse {
	return {
		reviews: 0,
		withinOneStep: 0,
		ungraded: 0,
		next: null,
		rows: [],
		groups: [],
		...report,
	};
}

function agreementRow(row: Partial<AgreementRow>): AgreementRow {
	return {
		stage: { kind: "run", run: RUN, stage: "shape" },
		stageName: "shape",
		judgeModel: "opus",
		judgeGrade: "B",
		operatorGrade: "B",
		stepsApart: 0,
		differences: [],
		note: null,
		...row,
	};
}

function renderCalibration(report: CalibrationResponse): void {
	renderAppWithStub("/calibration", new Map([["/api/calibration", report]]));
}

describe(CalibrationPage.name, () => {
	it("opens from the Calibration nav item, badged with the operator grades recorded", async () => {
		renderCalibration(reportWith({ reviews: 3, withinOneStep: 3 }));

		const item = await screen.findByRole("link", { name: "Calibration 3" });

		expect(item).toHaveAttribute("href", "/calibration");
		expect(item).toHaveAttribute("aria-current", "page");
		expect(
			screen.getByRole("heading", { name: "Judge calibration" }),
		).toBeInTheDocument();
	});

	it("heads the screen with the reviews recorded and how many agree within one letter step", async () => {
		renderCalibration(reportWith({ reviews: 41, withinOneStep: 34 }));

		const header = await screen.findByText(/reviews recorded/u);

		expect(header).toHaveTextContent(
			"41 reviews recorded · agreement within one letter step on 34/41 (83%)",
		);
	});

	it("tabulates each graded step's two letters, their agreement and where they differed", async () => {
		renderCalibration(
			reportWith({
				reviews: 3,
				withinOneStep: 2,
				rows: [
					agreementRow({}),
					agreementRow({
						stage: { kind: "run", run: RUN, stage: "decompose" },
						stageName: "decompose",
						judgeGrade: "A",
						stepsApart: 1,
						differences: [{ criterion: "clarity", judge: "A", operator: "B" }],
					}),
					agreementRow({
						stage: { kind: "replay", lineage: "audit", timestamp: RUN },
						judgeGrade: "D",
						stepsApart: 2,
						note: "judge accepted an unverified claim",
					}),
				],
			}),
		);

		const table = await screen.findByRole("table", {
			name: "Your grade against the judge's, same evidence",
		});
		const rows = within(table)
			.getAllByRole("row")
			.slice(1)
			.map((row) =>
				[...row.querySelectorAll("th, td")].map((cell) => cell.textContent),
			);

		expect(
			within(table)
				.getAllByRole("columnheader")
				.map((cell) => cell.textContent),
		).toEqual(["Step", "Judge", "You", "Agreement", "Where you differed"]);
		expect(rows).toEqual([
			[`${RUN} · shape`, "B", "B", "✓exact", "—"],
			[
				`${RUN} · decompose`,
				"A",
				"B",
				"≈within 1 step",
				"clarity: judge A, you B",
			],
			[
				"audit replay · shape",
				"D",
				"B",
				"✕2 steps apart",
				"judge accepted an unverified claim",
			],
		]);
	});

	it("shows each dimension's drift as a signed value over a seven-cell bar, or agrees", async () => {
		renderCalibration(
			reportWith({
				reviews: 3,
				withinOneStep: 3,
				groups: [
					{
						judgeModel: "opus",
						stage: "shape",
						rubricSha256: "a".repeat(64),
						reviews: 3,
						drift: [
							{ dimension: "evidence-quality", steps: 0.7 },
							{ dimension: "verbosity-control", steps: 0.5 },
							{ dimension: "scope-discipline", steps: 0.04 },
							{ dimension: "diff-hygiene", steps: -1 / 3 },
						],
					},
				],
			}),
		);

		const aside = await screen.findByRole("complementary", {
			name: "Where the judge drifts",
		});
		const items = within(aside)
			.getAllByRole("listitem")
			.map((item) => item.textContent);

		expect(items).toEqual([
			"evidence-qualityjudge +0.7 steps▮▮▮▮▯▯▯",
			"verbosity-controljudge +0.5 steps▮▮▮▯▯▯▯",
			"scope-disciplineagrees▮▯▯▯▯▯▯",
			"diff-hygienejudge −0.3 steps▮▮▯▯▯▯▯",
		]);
		expect(aside).toHaveTextContent(
			"Calibration does not change a grade. It tells you how much to trust one.",
		);
	});

	it("rounds a drift and its mirror to the same size, half a tenth away from agreement", async () => {
		renderCalibration(
			reportWith({
				reviews: 4,
				withinOneStep: 4,
				groups: [
					{
						judgeModel: "opus",
						stage: "shape",
						rubricSha256: "a".repeat(64),
						reviews: 4,
						drift: [
							{ dimension: "evidence-quality", steps: 0.25 },
							{ dimension: "verbosity-control", steps: -0.25 },
							{ dimension: "scope-discipline", steps: 0.05 },
							{ dimension: "diff-hygiene", steps: -0.05 },
						],
					},
				],
			}),
		);

		const aside = await screen.findByRole("complementary", {
			name: "Where the judge drifts",
		});

		expect(
			within(aside)
				.getAllByRole("listitem")
				.map((item) => item.textContent),
		).toEqual([
			"evidence-qualityjudge +0.3 steps▮▮▯▯▯▯▯",
			"verbosity-controljudge −0.3 steps▮▮▯▯▯▯▯",
			"scope-disciplinejudge +0.1 steps▮▯▯▯▯▯▯",
			"diff-hygienejudge −0.1 steps▮▯▯▯▯▯▯",
		]);
	});

	it("names the Judge model, step and rubric each drift figure belongs to", async () => {
		renderCalibration(
			reportWith({
				reviews: 1,
				withinOneStep: 1,
				groups: [
					{
						judgeModel: "opus",
						stage: "shape",
						rubricSha256: "abc123def456".padEnd(64, "0"),
						reviews: 1,
						drift: [{ dimension: "clarity", steps: 1 }],
					},
				],
			}),
		);

		const aside = await screen.findByRole("complementary", {
			name: "Where the judge drifts",
		});

		expect(aside).toHaveTextContent(
			"opus · shape · rubric abc123def456 · 1 review",
		);
		expect(within(aside).queryByRole("combobox")).not.toBeInTheDocument();
	});

	describe("when grades span more than one Judge model or rubric", () => {
		const groups: CalibrationResponse["groups"] = [
			{
				judgeModel: "opus",
				stage: "shape",
				rubricSha256: "abc123def456".padEnd(64, "0"),
				reviews: 2,
				drift: [{ dimension: "clarity", steps: 1 }],
			},
			{
				judgeModel: null,
				stage: "build",
				rubricSha256: null,
				reviews: 1,
				drift: [{ dimension: "diff-hygiene", steps: -1 }],
			},
		];

		it("shows the group with the most operator grades first, never a mean across groups", async () => {
			renderCalibration(reportWith({ reviews: 3, withinOneStep: 3, groups }));

			const aside = await screen.findByRole("complementary", {
				name: "Where the judge drifts",
			});

			expect(
				within(aside)
					.getAllByRole("listitem")
					.map((item) => item.textContent),
			).toEqual(["clarityjudge +1.0 steps▮▮▮▮▮▯▯"]);
			expect(
				within(aside).getByRole("combobox", { name: "Judge group" }),
			).toHaveDisplayValue("opus · shape · rubric abc123def456 · 2 reviews");
		});

		it("switches to another group's drift", async () => {
			renderCalibration(reportWith({ reviews: 3, withinOneStep: 3, groups }));
			const aside = await screen.findByRole("complementary", {
				name: "Where the judge drifts",
			});

			fireEvent.change(
				within(aside).getByRole("combobox", { name: "Judge group" }),
				{
					target: {
						value:
							"Judge model not recorded · build · rubric not recorded · 1 review",
					},
				},
			);

			expect(
				within(aside)
					.getAllByRole("listitem")
					.map((item) => item.textContent),
			).toEqual(["diff-hygienejudge −1.0 steps▮▮▮▮▮▯▯"]);
		});
	});

	it("opens the oldest ungraded step from Review next unjudged step", async () => {
		renderCalibration(
			reportWith({
				ungraded: 31,
				next: {
					kind: "rep",
					groupId: "group-1",
					repId: "rep-2",
					stage: "shape",
				},
			}),
		);

		const review = await screen.findByRole("link", {
			name: "Review next unjudged step",
		});

		expect(review).toHaveAttribute(
			"href",
			"/calibration/groups/group-1/reps/rep-2/stages/shape",
		);
	});

	describe("when no operator grade is recorded", () => {
		it("reads zero reviews without an agreement figure and still opens a step", async () => {
			renderCalibration(
				reportWith({
					ungraded: 31,
					next: { kind: "run", run: RUN, stage: "shape" },
				}),
			);

			const header = await screen.findByText(/reviews recorded/u);

			expect(header).toHaveTextContent(/^0 reviews recorded$/u);
			expect(
				screen.getByRole("link", { name: "Review next unjudged step" }),
			).toHaveAttribute("href", `/calibration/runs/${RUN}/stages/shape`);
		});
	});

	describe("when no step the Judge graded is recorded", () => {
		it("says so rather than calling every step graded", async () => {
			renderCalibration(reportWith({ reviews: 0, ungraded: 0, next: null }));

			const button = await screen.findByRole("button", {
				name: "Review next unjudged step",
			});

			expect(button).toBeDisabled();
			expect(
				screen.getByText("No step the judge graded is recorded yet."),
			).toBeInTheDocument();
			expect(
				screen.queryByText("Every judged step is graded."),
			).not.toBeInTheDocument();
		});
	});

	describe("when every judged step is graded", () => {
		it("offers no step to review", async () => {
			renderCalibration(reportWith({ reviews: 1, withinOneStep: 1 }));

			const button = await screen.findByRole("button", {
				name: "Review next unjudged step",
			});

			expect(button).toBeDisabled();
			expect(
				screen.getByText("Every judged step is graded."),
			).toBeInTheDocument();
		});
	});
});
