import { STAGE_LETTER_GRADES } from "#benchmark/config";
import type { StageLetterGrade } from "#benchmark/config";
import type {
	ConfirmationMode,
	ParsedConfirmationGroupRecord,
	ParsedConfirmationRepRecord,
} from "#benchmark/confirmation-record";
import type { Immutable } from "#benchmark/contracts";

import { costReading } from "./run-record";
import type { CostPart, CostReading, MissingPart, Reading } from "./run-record";
import SESSION_GRADE_REASON from "./session-grade-reason";

const UNGRADED_OUTCOME_COUNT_INCREMENT = 1;

const MIDPOINT_DIVISOR = 2;

const NO_UNGRADED_RESULTS = 0;

const FIRST_GRADED_LETTER_INDEX = 0;
const FINAL_GRADED_LETTER_OFFSET = -1;

const NO_SPEND_USD = 0;

const SESSION_CONFIRMATION_RECORD_VERSION = 2;

const EMPTY_COLLECTION_LENGTH = 0;

const NO_GRADED_REP_REASON = "no rep was graded at this stage";
const UNRECORDED_REP_REASON = "the rep recorded nothing";

/** A rep whose record the group lists but the server could not read. */
interface UnreadRep {
	readonly repId: string;
	readonly reason: string;
}

/** How many reps fell under each name, a verdict or a recorded status. */
type RepCounts = Readonly<Record<string, number>>;

/** Count a rep once for recorded quality failure, independently of execution/metrics gaps. */
function qualityFailureCount(
	reps: readonly Pick<
		Immutable<ParsedConfirmationRepRecord>,
		"stages" | "finalOutcome"
	>[],
): number {
	return reps.filter(
		({ stages, finalOutcome }) =>
			stages.some(
				(stage) => stage.status === "JUDGED" && stage.verdict === "STOP",
			) ||
			(finalOutcome.status === "JUDGED" && finalOutcome.verdict === "FAIL"),
	).length;
}

/** What a group's reps scored at one stage, its median by `letterRange`. */
interface GroupStageSummary {
	readonly stage: string;
	readonly graded: number;
	/** Each rep the stage did not grade, counted under its recorded status. */
	readonly ungraded: RepCounts;
	readonly grades: Reading<LetterRange>;
}

interface LetterRange {
	readonly median: StageLetterGrade;
	readonly lowest: StageLetterGrade;
	readonly highest: StageLetterGrade;
}

/**
 * The median of an even count is the lower of the two middle grades, so the
 * median is always a grade some rep received and never one between two letters.
 */
function letterRange(
	grades: readonly StageLetterGrade[],
): LetterRange | undefined {
	const bestToWorst = bestFirst(grades);
	const highest = bestToWorst.at(FIRST_GRADED_LETTER_INDEX);
	const lowest = bestToWorst.at(FINAL_GRADED_LETTER_OFFSET);
	const median = bestToWorst[Math.floor(bestToWorst.length / MIDPOINT_DIVISOR)];
	if (highest === undefined || lowest === undefined || median === undefined) {
		return undefined;
	}

	return { highest, lowest, median };
}

/** Best first, so a later index is a lower grade. */
function bestFirst(grades: readonly StageLetterGrade[]): StageLetterGrade[] {
	return grades.toSorted(
		(left, right) =>
			STAGE_LETTER_GRADES.indexOf(left) - STAGE_LETTER_GRADES.indexOf(right),
	);
}

function tally(names: readonly string[]): RepCounts {
	const counts = new Map<string, number>();
	for (const name of names) {
		counts.set(
			name,
			(counts.get(name) ?? NO_UNGRADED_RESULTS) +
				UNGRADED_OUTCOME_COUNT_INCREMENT,
		);
	}

	return Object.fromEntries(counts);
}

function stageSummary(
	mode: ConfirmationMode,
	stage: string,
	reps: readonly Immutable<ParsedConfirmationRepRecord>[],
): GroupStageSummary {
	const outcomes = reps.flatMap(({ stages }) =>
		stages.filter((outcome) => outcome.stage === stage),
	);
	const grades = outcomes.flatMap((outcome) =>
		outcome.status === "JUDGED" ? [outcome.grade] : [],
	);
	const ungraded = tally(
		outcomes.flatMap(({ status }) => (status === "JUDGED" ? [] : [status])),
	);
	if (mode === "session") {
		return {
			graded: grades.length,
			grades: { reasons: [SESSION_GRADE_REASON], state: "unavailable" },
			stage,
			ungraded,
		};
	}

	const range = letterRange(grades);
	if (range === undefined) {
		return {
			graded: 0,
			grades: { reasons: [NO_GRADED_REP_REASON], state: "unavailable" },
			stage,
			ungraded,
		};
	}

	return {
		graded: grades.length,
		grades: { state: "available", ...range },
		stage,
		ungraded,
	};
}

/**
 * One summary per declared stage. A session group's reps are graded by
 * their checks passing, not by a judge's letter, so its summary counts the
 * reps and serves no letter.
 */
function stageSummaries(
	mode: ConfirmationMode,
	declaredStages: readonly string[],
	reps: readonly Immutable<ParsedConfirmationRepRecord>[],
): readonly GroupStageSummary[] {
	return declaredStages.map((stage) => stageSummary(mode, stage, reps));
}

/**
 * The reps' final outcomes counted by the final judge's verdict where it
 * judged, and by the recorded status where it did not.
 */
function finalOutcomeTally(
	reps: readonly Immutable<ParsedConfirmationRepRecord>[],
): RepCounts {
	return tally(
		reps.map(({ finalOutcome }) =>
			finalOutcome.status === "JUDGED"
				? finalOutcome.verdict
				: finalOutcome.status,
		),
	);
}

function preflightCost(
	record: Immutable<ParsedConfirmationGroupRecord>,
): readonly (CostPart | MissingPart)[] {
	if (record.schemaVersion !== SESSION_CONFIRMATION_RECORD_VERSION) {
		return [];
	}
	if (record.preflight.status === "MISSING") {
		return [{ part: "preflight", reason: record.preflight.missing }];
	}

	return [{ part: "preflight", usd: record.preflight.call.metrics.costUsd }];
}

/**
 * A rep whose metrics are incomplete is summed over the calls it recorded
 * and named for the ones it lacks, so its part is never read as whole.
 */
function repCost(
	rep: Immutable<ParsedConfirmationRepRecord> | UnreadRep,
): readonly (CostPart | MissingPart)[] {
	const { repId } = rep;
	if (!("metrics" in rep)) {
		return [{ part: repId, reason: rep.reason }];
	}

	const { calls } = rep.metrics;
	const spent =
		calls.length === EMPTY_COLLECTION_LENGTH
			? []
			: [
					{
						part: repId,
						usd: calls.reduce(
							(sum, call) => sum + call.metrics.costUsd,
							NO_SPEND_USD,
						),
					},
				];
	if (rep.metrics.status === "MISSING") {
		return [...spent, { part: repId, reason: rep.metrics.missing.join("; ") }];
	}

	return spent;
}

/**
 * What the group spent: its preflight, then each rep in the order the group
 * lists them, read or not.
 */
function groupCost(
	record: Immutable<ParsedConfirmationGroupRecord>,
	reps: readonly (Immutable<ParsedConfirmationRepRecord> | UnreadRep)[],
): CostReading {
	return costReading([
		...preflightCost(record),
		...reps.flatMap((rep) => repCost(rep)),
	]);
}

export {
	NO_GRADED_REP_REASON,
	UNRECORDED_REP_REASON,
	qualityFailureCount,
	letterRange,
	stageSummaries,
	finalOutcomeTally,
	groupCost,
};
export type { UnreadRep, RepCounts, GroupStageSummary, LetterRange };
