/**
 * The grade letters, best first. This module has no imports, so the client
 * reads the same order the harness grades by instead of re-deriving it.
 */
export const STAGE_LETTER_GRADES = ["A", "B", "C", "D", "F"] as const;

export type StageLetterGrade = (typeof STAGE_LETTER_GRADES)[number];
