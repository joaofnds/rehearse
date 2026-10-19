import { screen, within } from "@testing-library/react";

import type { ComparisonArm } from "#benchmark/comparison-record";
import type { StageLetterGrade } from "#benchmark/stage-letter-grades";
import { renderWithRouter } from "#client/test-support/render-app";
import type {
	CaseAttempts,
	ComparisonAttempt,
} from "#server/comparison-attempts";
import type { ComparisonAttemptHistoryLink } from "#server/comparison-history-links";

import AttemptPairs from "./attempt-pairs";

type CaseHistories = Readonly<
	Record<ComparisonArm, readonly ComparisonAttemptHistoryLink[]>
>;

interface AttemptJudgment {
	readonly ordinal: number;
	readonly grade: StageLetterGrade;
	readonly words: number;
	readonly fired?: readonly string[] | undefined;
}

function graded({
	ordinal,
	grade,
	words,
	fired = [],
}: AttemptJudgment): ComparisonAttempt {
	return {
		blockersFired: {
			blockers: fired.map((id) => ({ id, stage: "shape" })),
			state: "available",
		},
		ordinal,
		outcomes: {
			outcomes: [{ grade, name: "shape", status: "JUDGED", successful: true }],
			state: "available",
		},
		repId: `rep-${String(ordinal)}`,
		words: { state: "available", words },
	};
}

const ATTEMPTS: CaseAttempts = {
	baseline: [
		graded({ grade: "B", ordinal: 1, words: 510 }),
		graded({ fired: ["scope-declared"], grade: "C", ordinal: 2, words: 537 }),
	],
	candidate: [
		graded({ grade: "A", ordinal: 1, words: 396 }),
		graded({ grade: "C", ordinal: 2, words: 468 }),
	],
	control: [
		graded({ grade: "C", ordinal: 1, words: 325 }),
		graded({ grade: "D", ordinal: 2, words: 259 }),
	],
};

function renderPairs(
	overrides: Readonly<{
		mode?: "stage" | "session";
		attempts?: CaseAttempts;
		histories?: CaseHistories;
	}> = {},
): void {
	renderWithRouter(
		<AttemptPairs
			digest="test-comparison"
			caseId="audit-log"
			mode={overrides.mode ?? "stage"}
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

export { ATTEMPTS, cell, graded, renderPairs, table };
