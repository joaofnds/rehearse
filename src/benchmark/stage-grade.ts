import { readStructuredOutput } from "./claude";
import { DEFAULT_MINIMUM_STAGE_GRADE, STAGE_LETTER_GRADES } from "./config";
import type {
	ClaudeEnvelope,
	StageGrade,
	StageJudgeInput,
	StageJudgeOutput,
	StageLetterGrade,
	StageRubric,
	StageScorecard,
} from "./contracts";
import { stageJudgeResponseSchema } from "./contracts";
import { applyAuthoritativeStageResults } from "./stage-harness-results";
import { checkedStageEvidence } from "./stage-judge-evidence";

const GRADE_ORDER: readonly StageLetterGrade[] = STAGE_LETTER_GRADES;

/** The items a stage letter is derived from, whoever graded them. */
interface StageLetterItems {
	readonly hardBlockers: readonly { readonly status: "PASS" | "FAIL" }[];
	readonly requirements: readonly { readonly status: "PASS" | "FAIL" }[];
	readonly dimensions: readonly { readonly grade: StageLetterGrade }[];
}

/**
 * F when any hard blocker fails, otherwise the worst dimension letter, capped
 * at C when any requirement fails.
 */
function deriveStageLetter(items: StageLetterItems): StageLetterGrade {
	if (items.hardBlockers.some(({ status }) => status === "FAIL")) {
		return "F";
	}

	const dimensionGrades = items.dimensions.map(({ grade }) => grade);

	return worstGrade(
		items.requirements.some(({ status }) => status === "FAIL")
			? ["C", ...dimensionGrades]
			: dimensionGrades,
	);
}

function deriveStageGrade(
	output: StageJudgeOutput,
	rubric: StageRubric,
): StageGrade {
	assertExactIds(
		output.hardBlockers.map(({ id }) => id),
		rubric.hardBlockers.map(({ id }) => id),
		"hard blockers",
	);
	assertExactIds(
		output.requirements.map(({ id }) => id),
		rubric.requirements.map(({ id }) => id),
		"requirements",
	);
	assertExactIds(
		output.dimensions.map(({ id }) => id),
		rubric.dimensions.map(({ id }) => id),
		"quality dimensions",
	);

	const grade = deriveStageLetter(output);

	return {
		...output,
		grade,
		verdict: ["A", "B"].includes(grade) ? "CONTINUE" : "STOP",
	};
}

function assertExactIds(
	observed: readonly string[],
	expected: readonly string[],
	label: string,
): void {
	if (
		observed.length !== expected.length ||
		new Set(observed).size !== observed.length ||
		expected.some((id) => !observed.includes(id))
	) {
		throw new Error(`Stage Judge must return every ${label} item exactly once`);
	}
}

function worstGrade(grades: readonly StageLetterGrade[]): StageLetterGrade {
	let worst: StageLetterGrade = "A";
	for (const grade of grades) {
		if (GRADE_ORDER.indexOf(grade) > GRADE_ORDER.indexOf(worst)) {
			worst = grade;
		}
	}
	return worst;
}

class StageQualityError extends Error {
	public override name = "StageQualityError";

	public constructor(
		public readonly scorecard: StageScorecard,
		minimumGrade: StageLetterGrade,
	) {
		super(
			`${scorecard.stage} stage graded ${scorecard.grade.grade}; minimum grade is ${minimumGrade}`,
		);
	}
}

/**
 * The Judge's verdict is derived against a fixed B, so a run that lowers the bar
 * cannot read it. The gate compares the letter instead, leaving every recorded
 * verdict comparable across runs that gated differently.
 */
function assertStageGradePassed(
	scorecard: StageScorecard,
	minimumGrade: StageLetterGrade | undefined = DEFAULT_MINIMUM_STAGE_GRADE,
): void {
	if (!stageGradePassed(scorecard, minimumGrade)) {
		throw new StageQualityError(scorecard, minimumGrade);
	}
}

/** Whether the stage's letter reaches the minimum, the gate's own test. */
function stageGradePassed(
	scorecard: StageScorecard,
	minimumGrade: StageLetterGrade | undefined = DEFAULT_MINIMUM_STAGE_GRADE,
): boolean {
	return letterReachesMinimum(scorecard.grade.grade, minimumGrade);
}

/** Whether a letter reaches the minimum, the test the gate applies. */
function letterReachesMinimum(
	letter: StageLetterGrade,
	minimumGrade: StageLetterGrade | undefined = DEFAULT_MINIMUM_STAGE_GRADE,
): boolean {
	return GRADE_ORDER.indexOf(letter) <= GRADE_ORDER.indexOf(minimumGrade);
}

interface StageGradeReading {
	readonly input: StageJudgeInput;
	readonly source: { readonly rubric: StageRubric };
	readonly rejected: (reason: string) => void;
}

function readStageGrade(
	envelope: ClaudeEnvelope,
	{ input, source, rejected }: StageGradeReading,
): StageGrade {
	try {
		const response = readStructuredOutput(envelope, stageJudgeResponseSchema);
		return deriveStageGrade(
			applyAuthoritativeStageResults(
				checkedStageEvidence(response, input),
				input,
			),
			source.rubric,
		);
	} catch (error) {
		rejected(error instanceof Error ? error.message : String(error));
		throw error;
	}
}

export {
	deriveStageLetter,
	deriveStageGrade,
	StageQualityError,
	assertStageGradePassed,
	stageGradePassed,
	letterReachesMinimum,
	readStageGrade,
};
export type { StageLetterItems };
