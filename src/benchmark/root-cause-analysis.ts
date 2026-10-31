import AnalysisCall from "./root-cause-analysis-call";
import {
	analysisBudgetUsd,
	refuseUnanalyzable,
} from "./root-cause-analysis-eligibility";
import { analysisPrompt, promptSafeJson } from "./root-cause-analysis-protocol";
import type {
	FailedAnalysis,
	RootCauseAnalysisRecord,
} from "./root-cause-analysis-protocol";
import { readSession } from "./root-cause-analysis-provider";
import { analysisRecordFiles } from "./root-cause-analysis-storage";
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

/** Installs the stop a signal makes, as stopOnSignal does, and answers its release. */
type SignalStopInstaller = (
	cleanUp: () => Promise<void>,
	recordStop: (signal: NodeJS.Signals) => Promise<void>,
) => () => void;

/** Where an analysis's record lives, and how it is first put there and then replaced. A claim
 * answers undefined when other analyses hold every name its start can take. */
interface AnalysisRecordWriter {
	readonly claim: (
		runsDirectory: string,
		record: FailedAnalysis,
	) => Promise<ClaimedAnalysis | undefined>;
	readonly replace: (
		file: string,
		record: RootCauseAnalysisRecord,
	) => Promise<void>;
}

interface ClaimedAnalysis {
	readonly file: string;
	readonly record: FailedAnalysis;
}

interface AnalysisDependencies {
	readonly invoke: AnalysisInvoker;
	readonly now: () => Date;
	readonly liveness: RunLiveness;
	readonly requireSpendCeiling: (recordsDirectory: string) => Promise<number>;
	/** Told what the call can spend before it is made. */
	readonly progress?: (message: string) => void;
	readonly records?: AnalysisRecordWriter;
	readonly stopOnSignal: SignalStopInstaller;
}

interface AnalysisResult {
	readonly file: string;
	readonly record: RootCauseAnalysisRecord;
	/** True when a stop signal ended the call and its record is the stop. */
	readonly stopped: boolean;
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
	const call = await AnalysisCall.claim({
		budgetUsd,
		bundle,
		bundleText,
		now: dependencies.now,
		records: dependencies.records ?? analysisRecordFiles,
		request,
		stopOnSignal: dependencies.stopOnSignal,
	});
	dependencies.progress?.(
		`Analyzing run ${request.run} with ${request.model}; the call spends at most $${budgetUsd}.`,
	);

	const reading = await readSession(
		dependencies.invoke,
		analysisPrompt(bundleText),
		budgetUsd,
	);

	return await call.settle(reading);
}

export { DEFAULT_ANALYSIS_BUDGET_USD, analyzeRun };
export type {
	AnalysisInvoker,
	AnalyzedRun,
	AnalysisRequest,
	AnalysisDependencies,
	AnalysisRecordWriter,
	AnalysisResult,
	ClaimedAnalysis,
	SignalStopInstaller,
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
