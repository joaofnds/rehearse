import { STAGE_LETTER_GRADES } from "#benchmark/config";
import type { StageLetterGrade } from "#benchmark/config";
import type { Immutable } from "#benchmark/contracts";
import type {
	ConfirmationMode,
	ParsedConfirmationGroupRecord,
	ParsedConfirmationRepRecord,
} from "#benchmark/confirmation-record";
import { costReading } from "./run-record";
import type { CostPart, CostReading, MissingPart, Reading } from "./run-record";

export const NO_GRADED_REP_REASON = "no rep was graded at this stage";
export const UNRECORDED_REP_REASON = "the rep recorded nothing";

/** How many reps fell under each name, a verdict or a recorded status. */
export type RepCounts = Readonly<Record<string, number>>;

/**
 * What a group's reps scored at one stage. The median of an even count is
 * the lower of the two middle grades, so the summary is always a grade some
 * rep received and never one between two letters.
 */
export interface GroupStageSummary {
	readonly stage: string;
	readonly graded: number;
	/** Each rep the stage did not grade, counted under its recorded status. */
	readonly ungraded: RepCounts;
	readonly grades: Reading<{
		readonly median: StageLetterGrade;
		readonly lowest: StageLetterGrade;
		readonly highest: StageLetterGrade;
	}>;
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
		counts.set(name, (counts.get(name) ?? 0) + 1);
	}

	return Object.fromEntries(counts);
}

function stageSummary(
	stage: string,
	reps: readonly Immutable<ParsedConfirmationRepRecord>[],
): GroupStageSummary {
	const outcomes = reps.flatMap(({ stages }) =>
		stages.filter((outcome) => outcome.stage === stage),
	);
	const grades = bestFirst(
		outcomes.flatMap((outcome) =>
			outcome.status === "JUDGED" ? [outcome.grade] : [],
		),
	);
	const ungraded = tally(
		outcomes.flatMap(({ status }) => (status === "JUDGED" ? [] : [status])),
	);
	const highest = grades.at(0);
	const lowest = grades.at(-1);
	const median = grades[Math.floor(grades.length / 2)];
	if (highest === undefined || lowest === undefined || median === undefined) {
		return {
			stage,
			graded: 0,
			ungraded,
			grades: { state: "unavailable", reasons: [NO_GRADED_REP_REASON] },
		};
	}

	return {
		stage,
		graded: grades.length,
		ungraded,
		grades: { state: "available", median, lowest, highest },
	};
}

/**
 * One summary per declared stage. A session group's reps are graded by
 * their checks passing, not by a judge's letter, so it summarizes no stage.
 */
export function stageSummaries(
	mode: ConfirmationMode,
	declaredStages: readonly string[],
	reps: readonly Immutable<ParsedConfirmationRepRecord>[],
): readonly GroupStageSummary[] {
	if (mode === "session") {
		return [];
	}

	return declaredStages.map((stage) => stageSummary(stage, reps));
}

/**
 * The reps' final outcomes counted by the final judge's verdict where it
 * judged, and by the recorded status where it did not.
 */
export function finalOutcomeTally(
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
	if (!("preflight" in record)) {
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
	repId: string,
	rep: Immutable<ParsedConfirmationRepRecord> | undefined,
): readonly (CostPart | MissingPart)[] {
	if (rep === undefined) {
		return [{ part: repId, reason: UNRECORDED_REP_REASON }];
	}

	const { calls } = rep.metrics;
	const spent =
		calls.length === 0
			? []
			: [
					{
						part: repId,
						usd: calls.reduce((sum, call) => sum + call.metrics.costUsd, 0),
					},
				];
	if (rep.metrics.status === "MISSING") {
		return [...spent, { part: repId, reason: rep.metrics.missing.join("; ") }];
	}

	return spent;
}

/** What the group spent: its preflight, then each rep in ordinal order. */
export function groupCost(
	record: Immutable<ParsedConfirmationGroupRecord>,
	reps: readonly Immutable<ParsedConfirmationRepRecord>[],
): CostReading {
	const byId = new Map(reps.map((rep) => [rep.repId, rep]));

	return costReading([
		...preflightCost(record),
		...record.repRecords.flatMap(({ repId }) =>
			repCost(repId, byId.get(repId)),
		),
	]);
}
