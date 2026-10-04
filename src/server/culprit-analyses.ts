import type {
	AnalyzedRun,
	CulpritAnalysisRecord,
	UnreadableAnalysis,
} from "#benchmark/culprit-analysis";
import {
	analysisBudgetUsd,
	DEFAULT_ANALYSIS_BUDGET_USD,
	readCulpritAnalyses,
	requireRecordedRun,
} from "#benchmark/culprit-analysis";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { requireSpendCeiling } from "#benchmark/settings";
import { redactAbsolutePaths } from "./redact-path";

/**
 * An analysis started from the browser runs under the model the project
 * compares recorded runs with, since the dialog has no model to pick.
 */
export const BROWSER_ANALYSIS_MODEL = "sonnet";

/**
 * What an analysis requested now would run under: the most it may spend, or
 * why a request would be refused, such as no stored ceiling.
 */
export type AnalysisRequestTerms =
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

export interface AnalysisReading {
	readonly run: string;
	readonly newest: CulpritAnalysisRecord | null;
	readonly earlierCount: number;
	readonly unreadable: readonly UnreadableAnalysis[];
	readonly request: AnalysisRequestTerms;
}

export function browserAnalysisCapUsd(ceilingUsd: number): number {
	return analysisBudgetUsd({
		ceilingUsd,
		capUsd: DEFAULT_ANALYSIS_BUDGET_USD,
	});
}

async function analysisRequestTerms(
	runsDirectory: string,
): Promise<AnalysisRequestTerms> {
	try {
		const ceilingUsd = await requireSpendCeiling(runsDirectory);

		return {
			model: BROWSER_ANALYSIS_MODEL,
			capUsd: browserAnalysisCapUsd(ceilingUsd),
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
			model: BROWSER_ANALYSIS_MODEL,
			capUsd: null,
			refusal: redactAbsolutePaths(refusal),
		};
	}
}

/**
 * Reading the analyses needs nothing from the settings, so a refused request
 * is stated beside them rather than failing the reading.
 */
export async function readAnalysisReading(
	analyzed: AnalyzedRun,
): Promise<AnalysisReading> {
	await requireRecordedRun(analyzed);
	const { records, unreadable } = await readCulpritAnalyses(analyzed);
	const { runsDirectory, run } = analyzed;

	return {
		run,
		newest: records.at(-1) ?? null,
		earlierCount: Math.max(records.length - 1, 0),
		unreadable: unreadable.map(({ file, reason }) => ({
			file,
			reason: redactAbsolutePaths(reason),
		})),
		request: await analysisRequestTerms(runsDirectory),
	};
}
