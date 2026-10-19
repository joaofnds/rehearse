import { RefusedPreconditionError } from "#benchmark/exit-codes";
import type {
	AnalyzedRun,
	RootCauseAnalysisRecord,
	UnreadableAnalysis,
} from "#benchmark/root-cause-analysis";
import {
	DEFAULT_ANALYSIS_BUDGET_USD,
	analysisBudgetUsd,
	readRootCauseAnalyses,
	requireRecordedRun,
} from "#benchmark/root-cause-analysis";
import { requireSpendCeiling } from "#benchmark/settings";

import { redactAbsolutePaths } from "./redact-path";

const NO_STALE_ANALYSIS_RECORDS = 0;

const CURRENT_ANALYSIS_RECORD_COUNT = 1;

const FINAL_ROOT_CAUSE_ANALYSIS_OFFSET = -1;

/**
 * An analysis started from the browser runs under the model the project
 * compares recorded runs with, since the dialog has no model to pick.
 */
const BROWSER_ANALYSIS_MODEL = "sonnet";

/**
 * What an analysis requested now would run under: the most it may spend, or
 * why a request would be refused, such as no stored ceiling.
 */
type AnalysisRequestTerms =
	| {
			readonly model: string;
			readonly capUsd: number;
			readonly refusal: null;
	  }
	| {
			readonly model: string;
			readonly capUsd: null;
			readonly refusal: string;
	  };

interface AnalysisReading {
	readonly run: string;
	readonly newest: RootCauseAnalysisRecord | null;
	readonly earlierCount: number;
	readonly unreadable: readonly UnreadableAnalysis[];
	readonly request: AnalysisRequestTerms;
}

function browserAnalysisCapUsd(ceilingUsd: number): number {
	return analysisBudgetUsd({
		capUsd: DEFAULT_ANALYSIS_BUDGET_USD,
		ceilingUsd,
	});
}

async function analysisRequestTerms(
	runsDirectory: string,
): Promise<AnalysisRequestTerms> {
	try {
		const ceilingUsd = await requireSpendCeiling(runsDirectory);

		return {
			capUsd: browserAnalysisCapUsd(ceilingUsd),
			model: BROWSER_ANALYSIS_MODEL,
			refusal: null,
		};
	} catch (error) {
		// A settings file the system will not open is refused like one that
		// does not parse, since the launch would fail on it the same way.
		const refusal =
			error instanceof RefusedPreconditionError
				? error.message
				: `The settings file cannot be opened, so nothing spends until it can: ${error instanceof Error ? error.message : String(error)}`;

		return {
			capUsd: null,
			model: BROWSER_ANALYSIS_MODEL,
			refusal: redactAbsolutePaths(refusal),
		};
	}
}

/**
 * Reading the analyses needs nothing from the settings, so a refused request
 * is stated beside them rather than failing the reading.
 */
async function readAnalysisReading(
	analyzed: AnalyzedRun,
): Promise<AnalysisReading> {
	await requireRecordedRun(analyzed);
	const { records, unreadable } = await readRootCauseAnalyses(analyzed);
	const { runsDirectory, run } = analyzed;

	return {
		earlierCount: Math.max(
			records.length - CURRENT_ANALYSIS_RECORD_COUNT,
			NO_STALE_ANALYSIS_RECORDS,
		),
		newest: records.at(FINAL_ROOT_CAUSE_ANALYSIS_OFFSET) ?? null,
		request: await analysisRequestTerms(runsDirectory),
		run,
		unreadable: unreadable.map(({ file, reason }) => ({
			file,
			reason: redactAbsolutePaths(reason),
		})),
	};
}

export { BROWSER_ANALYSIS_MODEL, browserAnalysisCapUsd, readAnalysisReading };
export type { AnalysisRequestTerms, AnalysisReading };
