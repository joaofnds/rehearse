import type { CulpritAnalysisRecord } from "#benchmark/culprit-analysis";
import {
	analysisBudgetUsd,
	DEFAULT_ANALYSIS_BUDGET_USD,
	readCulpritAnalyses,
	requireRecordedRun,
} from "#benchmark/culprit-analysis";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { readSettings } from "#benchmark/settings";

/**
 * An analysis started from the browser runs under the model the project
 * compares recorded runs with, since the dialog has no model to pick.
 */
export const BROWSER_ANALYSIS_MODEL = "sonnet";

/** What an analysis requested now would run under, or null with no ceiling. */
export interface AnalysisRequestTerms {
	readonly model: string;
	readonly capUsd: number | null;
}

export interface AnalysisReading {
	readonly run: string;
	readonly newest: CulpritAnalysisRecord | null;
	readonly earlier: number;
	readonly request: AnalysisRequestTerms;
}

/**
 * The settings file that holds the ceiling cannot be read. The run is there,
 * so this is a conflict for the operator to fix rather than a missing record.
 */
export class AnalysisTermsUnreadableError extends Error {
	public override name = "AnalysisTermsUnreadableError";
}

async function storedCeilingUsd(
	runsDirectory: string,
): Promise<number | undefined> {
	try {
		const settings = await readSettings(runsDirectory);
		return settings.spendCeilingUsd;
	} catch (error) {
		if (!(error instanceof RefusedPreconditionError)) {
			throw error;
		}
		throw new AnalysisTermsUnreadableError(error.message);
	}
}

/** The most a browser-requested analysis may spend under the stored ceiling. */
export function browserAnalysisCapUsd(ceilingUsd: number): number {
	return analysisBudgetUsd({
		ceilingUsd,
		capUsd: DEFAULT_ANALYSIS_BUDGET_USD,
	});
}

export async function analysisRequestTerms(
	runsDirectory: string,
): Promise<AnalysisRequestTerms> {
	const spendCeilingUsd = await storedCeilingUsd(runsDirectory);

	return {
		model: BROWSER_ANALYSIS_MODEL,
		capUsd:
			spendCeilingUsd === undefined
				? null
				: browserAnalysisCapUsd(spendCeilingUsd),
	};
}

/** The run's newest analysis, how many came before it, and what another costs. */
export async function readAnalysisReading(
	runsDirectory: string,
	run: string,
): Promise<AnalysisReading> {
	await requireRecordedRun(runsDirectory, run);
	const analyses = await readCulpritAnalyses(runsDirectory, run);

	return {
		run,
		newest: analyses.at(-1) ?? null,
		earlier: Math.max(analyses.length - 1, 0),
		request: await analysisRequestTerms(runsDirectory),
	};
}
