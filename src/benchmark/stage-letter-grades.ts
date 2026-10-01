/**
 * The grade letters, best first. This module has no imports, so the client
 * reads the same order the harness grades by instead of re-deriving it.
 */
export const STAGE_LETTER_GRADES = ["A", "B", "C", "D", "F"] as const;

export type StageLetterGrade = (typeof STAGE_LETTER_GRADES)[number];

const GRADE_STEPS: ReadonlyMap<string, number> = new Map(
	STAGE_LETTER_GRADES.map((letter, step) => [letter, step]),
);

/** Where a letter sits in the grade order, best first; a letter outside it has no step. */
export function gradeStep(letter: string): number | undefined {
	return GRADE_STEPS.get(letter);
}
