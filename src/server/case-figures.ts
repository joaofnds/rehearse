import { atLatestCorpusVersion } from "./latest-corpus-version";

/**
 * One run of a case as its figures read it: a pipeline run, a session
 * attempt, or one rep of a pipeline or session confirmation group.
 */
export interface CaseRun {
	readonly corpusDigest: string | undefined;
	/**
	 * The final Judge's PASS for a pipeline run, the checks passing for a
	 * session run, and undefined where nothing judged the run.
	 */
	readonly passed: boolean | undefined;
	/** Undefined where the records do not hold the run's whole cost. */
	readonly costUsd: number | undefined;
}

export interface CostPerRun {
	readonly meanUsd: number | null;
	readonly costed: number;
	readonly lacking: number;
}

/**
 * A case's figures over the runs at the latest corpus version it ran under,
 * naming that version and counting the runs left out (SPEC.md product rule 2).
 */
export type CaseFigures =
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
	const total = costs.reduce((sum, usd) => sum + usd, 0);

	return {
		meanUsd: costs.length === 0 ? null : total / costs.length,
		costed: costs.length,
		lacking: runs.length - costs.length,
	};
}

/** `runs` is newest first. */
export function caseFigures(runs: readonly CaseRun[]): CaseFigures {
	if (runs.length === 0) {
		return { state: "no-runs" };
	}

	const { counted, corpusVersion, leftOut } = atLatestCorpusVersion(
		runs,
		({ corpusDigest }) => corpusDigest,
	);
	const judged = counted.filter(({ passed }) => passed !== undefined);

	return {
		state: "measured",
		corpusVersion,
		counted: counted.length,
		leftOut,
		judged: judged.length,
		passed: judged.filter(({ passed }) => passed === true).length,
		costPerRun: costPerRun(counted),
	};
}

/**
 * The median of the final Judge's verdicts, FAIL ranked below PASS. On an
 * even count it is the lower of the two middle verdicts, as a group's median
 * grade is, so it is always a verdict some run received.
 */
export function medianVerdict(
	passed: number,
	judged: number,
): "PASS" | "FAIL" | null {
	if (judged === 0) {
		return null;
	}

	return passed > Math.floor(judged / 2) ? "PASS" : "FAIL";
}
