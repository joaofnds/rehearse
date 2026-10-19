import {
	analysisRecordBase,
	resolveReading,
	withCost,
} from "./root-cause-analysis-answer";
import {
	analysisBudgetUsd,
	refuseUnanalyzable,
} from "./root-cause-analysis-eligibility";
import { analysisPrompt, promptSafeJson } from "./root-cause-analysis-protocol";
import type { RootCauseAnalysisRecord } from "./root-cause-analysis-protocol";
import { readSession } from "./root-cause-analysis-provider";
import { writeAnalysis } from "./root-cause-analysis-storage";
import { assembleRootCauseBundle } from "./root-cause-bundle";
import type { RunLiveness } from "./run-liveness";

type AnalysisInvoker = (prompt: string, budgetUsd: number) => Promise<string>;

interface AnalyzedRun {
	readonly runsDirectory: string;
	readonly run: string;
}

interface AnalysisRequest extends AnalyzedRun {
	readonly model: string;
	readonly capUsd: number;
}

const DEFAULT_ANALYSIS_BUDGET_USD = 1;

interface AnalysisDependencies {
	readonly invoke: AnalysisInvoker;
	readonly now: () => Date;
	readonly liveness: RunLiveness;
	readonly requireSpendCeiling: (recordsDirectory: string) => Promise<number>;
	/** Told what the call can spend before it is made. */
	readonly progress?: (message: string) => void;
}

interface AnalysisResult {
	readonly file: string;
	readonly record: RootCauseAnalysisRecord;
}

async function analyzeRun(
	request: AnalysisRequest,
	dependencies: AnalysisDependencies,
): Promise<AnalysisResult> {
	await refuseUnanalyzable(request, dependencies.liveness);
	const budgetUsd = analysisBudgetUsd({
		capUsd: request.capUsd,
		ceilingUsd: await dependencies.requireSpendCeiling(request.runsDirectory),
	});
	const bundle = await assembleRootCauseBundle(
		request.runsDirectory,
		request.run,
	);
	const bundleText = promptSafeJson(bundle);
	dependencies.progress?.(
		`Analyzing run ${request.run} with ${request.model}; the call spends at most $${budgetUsd}.`,
	);

	const started = dependencies.now();
	const reading = await readSession(
		dependencies.invoke,
		analysisPrompt(bundleText),
		budgetUsd,
	);

	const base = analysisRecordBase({
		budgetUsd,
		bundleText,
		finished: dependencies.now(),
		request,
		started,
	});
	const record = resolveReading(base, reading, bundle);

	return await writeAnalysis(
		request.runsDirectory,
		withCost(record, reading.costUsd),
	);
}

export { DEFAULT_ANALYSIS_BUDGET_USD, analyzeRun };
export type {
	AnalysisInvoker,
	AnalyzedRun,
	AnalysisRequest,
	AnalysisDependencies,
	AnalysisResult,
};
export {
	analysisSessionArgs,
	sealedAnalysisInvoker,
} from "./root-cause-analysis-provider";
export {
	analysisBudgetUsd,
	requireRecordedRun,
	refuseUnanalyzable,
} from "./root-cause-analysis-eligibility";
export { readRootCauseAnalyses } from "./root-cause-analysis-storage";
export type {
	RecordedAnalysis,
	FailedAnalysis,
	RootCauseAnalysisRecord,
} from "./root-cause-analysis-protocol";
export type { UnreadableAnalysis } from "./root-cause-analysis-storage";
