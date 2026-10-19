import type { StageLetterGrade } from "#benchmark/contracts";
import type { OperatorGrade } from "#benchmark/operator-grade";

import type { StageReview } from "./stage-review-query";

type PassFail = "PASS" | "FAIL";

const PASS_FAIL: readonly PassFail[] = ["PASS", "FAIL"];

interface Draft {
	readonly statuses: Readonly<Record<string, PassFail>>;
	readonly letters: Readonly<Record<string, StageLetterGrade>>;
	readonly note: string;
}

const EMPTY_DRAFT: Draft = { letters: {}, note: "", statuses: {} };

type Criteria = StageReview["criteria"];

interface CriterionGrades {
	readonly hardBlockers: readonly {
		readonly id: string;
		readonly status: string;
	}[];
	readonly requirements: readonly {
		readonly id: string;
		readonly status: string;
	}[];
	readonly dimensions: readonly {
		readonly id: string;
		readonly grade: string;
	}[];
}

/** Each criterion's id with its status or letter, in rubric order. */
function criterionValues(
	grades: CriterionGrades,
): readonly (readonly [string, string])[] {
	return [
		...grades.hardBlockers.map(({ id, status }) => [id, status] as const),
		...grades.requirements.map(({ id, status }) => [id, status] as const),
		...grades.dimensions.map(({ id, grade }) => [id, grade] as const),
	];
}

/** The grade the draft makes, or nothing while any criterion is ungraded. */
function completeGrade(
	criteria: Criteria,
	draft: Draft,
): OperatorGrade | undefined {
	const hardBlockers = criteria.hardBlockers.flatMap(({ id }) => {
		const status = draft.statuses[id];
		return status === undefined ? [] : [{ id, status }];
	});
	const requirements = criteria.requirements.flatMap(({ id }) => {
		const status = draft.statuses[id];
		return status === undefined ? [] : [{ id, status }];
	});
	const dimensions = criteria.dimensions.flatMap(({ id }) => {
		const grade = draft.letters[id];
		return grade === undefined ? [] : [{ grade, id }];
	});
	const graded =
		hardBlockers.length === criteria.hardBlockers.length &&
		requirements.length === criteria.requirements.length &&
		dimensions.length === criteria.dimensions.length;
	if (!graded) {
		return undefined;
	}

	const note = draft.note.trim();

	return {
		dimensions,
		hardBlockers,
		note: note === "" ? undefined : note,
		requirements,
	};
}

function dimensionHints(
	dimension: Criteria["dimensions"][number],
): readonly string[] {
	return [dimension.good, dimension.excellent].filter(
		(hint): hint is string => hint !== undefined,
	);
}

export {
	completeGrade,
	criterionValues,
	dimensionHints,
	EMPTY_DRAFT,
	PASS_FAIL,
};
export type { Criteria, Draft, PassFail };
