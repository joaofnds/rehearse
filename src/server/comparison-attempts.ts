import type {
	ComparisonArm,
	ComparisonReport,
	LegacyComparisonReport,
} from "#benchmark/comparison-record";
import type { OutputWords } from "#benchmark/output-words";

type AnyComparisonReport = ComparisonReport | LegacyComparisonReport;
type ReportCase = AnyComparisonReport["cases"][number];
type ReportRep = ReportCase["arms"][ComparisonArm]["source"]["reps"][number];
type RepOutcomes = Extract<
	ReportRep,
	{ readonly outcomes: unknown }
>["outcomes"];

export const NO_RECORDED_OUTCOMES_REASON =
	"this report records no per-attempt outcomes";
export const NO_RECORDED_GRADING_REASON =
	"this report records no per-attempt blocker grading";
export const NO_RECORDED_ATTEMPT_WORDS_REASON =
	"this report records no word count for this attempt";

interface FiredBlocker {
	readonly stage: string;
	readonly id: string;
}

/**
 * One recorded attempt as its own record shows it. It carries no pair index
 * and no seed, because nothing the harness records ties an attempt of one arm
 * to an attempt of another.
 */
export interface ComparisonAttempt {
	readonly repId: string;
	readonly ordinal: number;
	readonly outcomes:
		| { readonly state: "available"; readonly outcomes: RepOutcomes }
		| { readonly state: "unavailable"; readonly reason: string };
	readonly blockersFired:
		| {
				readonly state: "available";
				readonly blockers: readonly FiredBlocker[];
		  }
		| { readonly state: "unavailable"; readonly reason: string };
	readonly words: OutputWords;
}

export interface CaseAttempts {
	readonly baseline: readonly ComparisonAttempt[];
	readonly candidate: readonly ComparisonAttempt[];
	readonly control: readonly ComparisonAttempt[];
}

function outcomesOf(rep: ReportRep): ComparisonAttempt["outcomes"] {
	if (!("outcomes" in rep)) {
		return { state: "unavailable", reason: NO_RECORDED_OUTCOMES_REASON };
	}

	return { state: "available", outcomes: rep.outcomes };
}

function blockersFiredOf(rep: ReportRep): ComparisonAttempt["blockersFired"] {
	if (!("stageGrading" in rep) || rep.stageGrading === undefined) {
		return { state: "unavailable", reason: NO_RECORDED_GRADING_REASON };
	}

	return {
		state: "available",
		blockers: rep.stageGrading.flatMap(({ stage, hardBlockers }) =>
			hardBlockers
				.filter(({ fired }) => fired)
				.map(({ id }) => ({ stage, id })),
		),
	};
}

function wordsOf(rep: ReportRep): OutputWords {
	if (!("words" in rep) || rep.words === undefined) {
		return { state: "unavailable", reason: NO_RECORDED_ATTEMPT_WORDS_REASON };
	}

	return rep.words;
}

function attemptsOf(reps: readonly ReportRep[]): readonly ComparisonAttempt[] {
	return reps.map((rep) => ({
		repId: rep.repId,
		ordinal: rep.ordinal,
		outcomes: outcomesOf(rep),
		blockersFired: blockersFiredOf(rep),
		words: wordsOf(rep),
	}));
}

/** Each arm's attempts side by side, in the order each arm recorded them. */
export function comparisonAttempts(benchmarkCase: ReportCase): CaseAttempts {
	return {
		baseline: attemptsOf(benchmarkCase.arms.baseline.source.reps),
		candidate: attemptsOf(benchmarkCase.arms.candidate.source.reps),
		control: attemptsOf(benchmarkCase.arms.control.source.reps),
	};
}
