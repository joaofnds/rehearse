import { describe, expect, it } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import type { ComparisonArm } from "#benchmark/comparison-record";
import type { StageLetterGrade } from "#benchmark/stage-letter-grades";
import type {
	CaseAttempts,
	ComparisonAttempt,
} from "#server/comparison-attempts";
import type { ComparisonAttemptHistoryLink } from "#server/comparison-history-links";
import { AttemptPairs } from "./attempt-pairs";

type CaseHistories = Readonly<
	Record<ComparisonArm, readonly ComparisonAttemptHistoryLink[]>
>;

function graded(
	ordinal: number,
	grade: StageLetterGrade,
	words: number,
	fired: readonly string[] = [],
): ComparisonAttempt {
	return {
		repId: `rep-${String(ordinal)}`,
		ordinal,
		outcomes: {
			state: "available",
			outcomes: [{ name: "shape", status: "JUDGED", grade, successful: true }],
		},
		blockersFired: {
			state: "available",
			blockers: fired.map((id) => ({ stage: "shape", id })),
		},
		words: { state: "available", words },
	};
}

const ATTEMPTS: CaseAttempts = {
	control: [graded(1, "C", 325), graded(2, "D", 259)],
	baseline: [graded(1, "B", 510), graded(2, "C", 537, ["scope-declared"])],
	candidate: [graded(1, "A", 396), graded(2, "C", 468)],
};

function renderPairs(
	overrides: Readonly<{
		attempts?: CaseAttempts;
		histories?: CaseHistories;
	}> = {},
): void {
	render(
		<AttemptPairs
			caseId="audit-log"
			mode="stage"
			attempts={overrides.attempts ?? ATTEMPTS}
			histories={overrides.histories}
		/>,
	);
}

function table(): HTMLElement {
	return screen.getByRole("table", { name: "Attempt pairs · audit-log" });
}

function cell(attempt: string, arm: string): HTMLElement {
	const columns = within(table())
		.getAllByRole("columnheader")
		.map((header) => header.textContent);
	const row = within(table()).getByRole("rowheader", {
		name: attempt,
	}).parentElement;
	if (row === null) {
		throw new Error(`Missing row ${attempt}`);
	}
	const found = row.children[columns.indexOf(arm)];
	if (!(found instanceof HTMLElement)) {
		throw new Error(`Missing ${arm} cell in ${attempt}`);
	}

	return found;
}

describe(AttemptPairs.name, () => {
	it("lists each arm's attempts side by side, baseline arm first", () => {
		renderPairs();

		const columns = within(table())
			.getAllByRole("columnheader")
			.map((header) => header.textContent);

		expect(columns).toEqual(["Attempt", "Baseline", "Arm A", "Arm B"]);
		expect(cell("Attempt 1", "Baseline")).toHaveTextContent("C");
		expect(cell("Attempt 1", "Arm A")).toHaveTextContent("B");
		expect(cell("Attempt 1", "Arm B")).toHaveTextContent("A");
		expect(cell("Attempt 2", "Baseline")).toHaveTextContent("D");
	});

	it("shows each attempt's words and the blockers that fired on it", () => {
		renderPairs();

		expect(cell("Attempt 2", "Arm A")).toHaveTextContent("537 words");
		expect(cell("Attempt 2", "Arm A")).toHaveTextContent(
			"fired shape · scope-declared",
		);
		expect(cell("Attempt 1", "Arm A")).toHaveTextContent("no blocker fired");
	});

	it("claims no change between attempts, since no record ties one arm's attempt to another's", () => {
		renderPairs();

		expect(
			within(table()).queryByRole("columnheader", { name: /→/u }),
		).not.toBeInTheDocument();
		expect(within(table()).queryByText(/step|no change/u)).toBeNull();
	});

	it("leaves an arm's cell empty past its last attempt", () => {
		renderPairs({
			attempts: { ...ATTEMPTS, candidate: [graded(1, "A", 396)] },
		});

		expect(cell("Attempt 2", "Arm B")).toHaveTextContent("no attempt");
	});

	it("names the stage of each outcome a pipeline attempt recorded", () => {
		const attempt: ComparisonAttempt = {
			...graded(1, "B", 100),
			outcomes: {
				state: "available",
				outcomes: [
					{ name: "build", status: "JUDGED", grade: "B", successful: true },
					{ name: "final", status: "NOT_REACHED", successful: false },
				],
			},
		};
		renderPairs({
			attempts: { ...ATTEMPTS, baseline: [attempt] },
		});

		expect(cell("Attempt 1", "Arm A")).toHaveTextContent("build B");
		expect(cell("Attempt 1", "Arm A")).toHaveTextContent("final not reached");
	});

	it("states once why words or blockers were not recorded", () => {
		const unrecorded: ComparisonAttempt = {
			...graded(1, "B", 0),
			blockersFired: { state: "unavailable", reason: "no blocker grading" },
			words: { state: "unavailable", reason: "no word count" },
		};
		renderPairs({
			attempts: {
				control: [unrecorded],
				baseline: [unrecorded],
				candidate: [unrecorded],
			},
		});

		expect(cell("Attempt 1", "Arm A")).toHaveTextContent("words not recorded");
		expect(
			screen.getByText("Words not recorded: no word count."),
		).toBeInTheDocument();
		expect(
			screen.getByText("Blockers not recorded: no blocker grading."),
		).toBeInTheDocument();
	});

	describe("attempt history", () => {
		it("links each attempt whose saved history the comparison still vouches for, and marks the rest stale", () => {
			renderPairs({
				histories: {
					control: [{ status: "stale", repId: "rep-1", ordinal: 1 }],
					baseline: [
						{
							status: "available",
							repId: "rep-1",
							ordinal: 1,
							href: "/groups/g/reps/rep-1/attempt",
						},
					],
					candidate: [],
				},
			});

			expect(
				within(cell("Attempt 1", "Arm A")).getByRole("link", {
					name: "Arm A attempt 1 history",
				}),
			).toHaveAttribute("href", "/groups/g/reps/rep-1/attempt");
			expect(cell("Attempt 1", "Baseline")).toHaveTextContent("stale");
		});

		it("says a comparison that records no session has no attempt history to open", () => {
			renderPairs();

			expect(screen.queryByRole("link")).not.toBeInTheDocument();
			expect(
				screen.getByText(
					"No attempt history to open: a stage comparison's attempts record no session.",
				),
			).toBeInTheDocument();
		});
	});
});
