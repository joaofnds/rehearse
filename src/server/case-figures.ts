import type { SessionAttemptRecord } from "#benchmark/session-record";

import atLatestCorpusVersion from "./latest-corpus-version";
import type { SavedStateAssessment } from "./saved-state-assessment";

const MEDIAN_PARTITION_DIVISOR = 2;

const NO_JUDGED_RESULTS = 0;

const NO_SPEND_USD = 0;

const EMPTY_COLLECTION_LENGTH = 0;

/**
 * One run of a case as its figures read it: a pipeline run, a session
 * attempt, or one rep of a pipeline or session confirmation group.
 */
interface CaseRun {
	readonly corpusDigest: string | undefined;
	/**
	 * The final Judge's PASS for a pipeline run, the checks passing for a
	 * session run, and undefined where nothing judged the run.
	 */
	readonly passed: boolean | undefined;
	/** Undefined where the records do not hold the run's whole cost. */
	readonly costUsd: number | undefined;
	readonly savedState?: SavedStateAssessment;
	readonly recordedOutcome?: SessionAttemptRecord["outcome"];
	readonly replyChecks?: { readonly passed: number; readonly total: number };
}

interface CostPerRun {
	readonly meanUsd: number | null;
	readonly costed: number;
	readonly lacking: number;
}

/**
 * A case's figures over the runs at the latest corpus version it ran under,
 * naming that version and counting the runs left out (SPEC.md product rule 2).
 */
type CaseFigures =
	| { readonly state: "no-runs" }
	| {
			readonly state: "measured";
			readonly corpusVersion: string | null;
			readonly counted: number;
			readonly leftOut: number;
			readonly judged: number;
			readonly passed: number;
			readonly costPerRun: CostPerRun;
	  };

function costPerRun(runs: readonly CaseRun[]): CostPerRun {
	const costs = runs.flatMap(({ costUsd }) =>
		costUsd === undefined ? [] : [costUsd],
	);
	const total = costs.reduce((sum, usd) => sum + usd, NO_SPEND_USD);

	return {
		costed: costs.length,
		lacking: runs.length - costs.length,
		meanUsd:
			costs.length === EMPTY_COLLECTION_LENGTH ? null : total / costs.length,
	};
}

/** `runs` is newest first. */
function caseFigures(runs: readonly CaseRun[]): CaseFigures {
	if (runs.length === EMPTY_COLLECTION_LENGTH) {
		return { state: "no-runs" };
	}

	const { counted, corpusVersion, leftOut } = atLatestCorpusVersion(
		runs,
		({ corpusDigest }) => corpusDigest,
	);
	const judged = counted.filter(({ passed }) => passed !== undefined);

	return {
		corpusVersion,
		costPerRun: costPerRun(counted),
		counted: counted.length,
		judged: judged.length,
		leftOut,
		passed: judged.filter(({ passed }) => passed === true).length,
		state: "measured",
	};
}

/**
 * The median of the final Judge's verdicts, FAIL ranked below PASS. On an
 * even count it is the lower of the two middle verdicts, as a group's median
 * grade is, so it is always a verdict some run received.
 */
function medianVerdict({
	passed,
	judged,
}: {
	readonly passed: number;
	readonly judged: number;
}): "PASS" | "FAIL" | null {
	if (judged === NO_JUDGED_RESULTS) {
		return null;
	}

	return passed > Math.floor(judged / MEDIAN_PARTITION_DIVISOR)
		? "PASS"
		: "FAIL";
}

export { caseFigures, medianVerdict };
export type { CaseRun, CostPerRun, CaseFigures };
