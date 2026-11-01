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

const NO_RECORDED_OUTCOMES_REASON =
	"this report records no per-attempt outcomes";
const NO_RECORDED_GRADING_REASON =
	"this report records no per-attempt blocker grading";
const NO_RECORDED_ATTEMPT_WORDS_REASON =
	"this report records no word count for this attempt";

type ScoredRep = Extract<ReportRep, { readonly checks?: unknown }>;

interface FiredBlocker {
	readonly stage: string;
	readonly id: string;
}

/**
 * One recorded attempt as its own record shows it. It carries no pair index
 * and no seed, because nothing the harness records ties an attempt of one arm
 * to an attempt of another.
 */
interface ComparisonAttempt {
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
	readonly checks?: ScoredRep["checks"];
	readonly judge?: ScoredRep["judge"];
	readonly stateChecks?: ScoredRep["stateResults"];
}

interface CaseAttempts {
	readonly baseline: readonly ComparisonAttempt[];
	readonly candidate: readonly ComparisonAttempt[];
	readonly control: readonly ComparisonAttempt[];
}

function outcomesOf(rep: ReportRep): ComparisonAttempt["outcomes"] {
	if (!("outcomes" in rep)) {
		return { reason: NO_RECORDED_OUTCOMES_REASON, state: "unavailable" };
	}

	return { outcomes: rep.outcomes, state: "available" };
}

function blockersFiredOf(rep: ReportRep): ComparisonAttempt["blockersFired"] {
	if (!("stageGrading" in rep) || rep.stageGrading === undefined) {
		return { reason: NO_RECORDED_GRADING_REASON, state: "unavailable" };
	}

	return {
		blockers: rep.stageGrading.flatMap(({ stage, hardBlockers }) =>
			hardBlockers
				.filter(({ fired }) => fired)
				.map(({ id }) => ({ id, stage })),
		),
		state: "available",
	};
}

function wordsOf(rep: ReportRep): OutputWords {
	if (!("words" in rep) || rep.words === undefined) {
		return { reason: NO_RECORDED_ATTEMPT_WORDS_REASON, state: "unavailable" };
	}

	return rep.words;
}

function attemptsOf(reps: readonly ReportRep[]): readonly ComparisonAttempt[] {
	return reps.map((rep) => ({
		blockersFired: blockersFiredOf(rep),
		checks: "checks" in rep ? rep.checks : undefined,
		judge: "judge" in rep ? rep.judge : undefined,
		ordinal: rep.ordinal,
		outcomes: outcomesOf(rep),
		repId: rep.repId,
		stateChecks: "stateResults" in rep ? rep.stateResults : undefined,
		words: wordsOf(rep),
	}));
}

/** Each arm's attempts side by side, in the order each arm recorded them. */
function comparisonAttempts(benchmarkCase: {
	readonly arms: Readonly<
		Record<
			ComparisonArm,
			{ readonly source: { readonly reps: readonly ReportRep[] } }
		>
	>;
}): CaseAttempts {
	return {
		baseline: attemptsOf(benchmarkCase.arms.baseline.source.reps),
		candidate: attemptsOf(benchmarkCase.arms.candidate.source.reps),
		control: attemptsOf(benchmarkCase.arms.control.source.reps),
	};
}

export {
	NO_RECORDED_OUTCOMES_REASON,
	NO_RECORDED_GRADING_REASON,
	NO_RECORDED_ATTEMPT_WORDS_REASON,
	comparisonAttempts,
};
export type { ComparisonAttempt, CaseAttempts };
