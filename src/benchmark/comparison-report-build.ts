import type { ComparisonEvidence } from "./comparison-evidence";
import liveReadNotices from "./comparison-live-reads";
import { loadComparisonEvidence } from "./comparison-loader";
import type { ComparisonReport } from "./comparison-record";
import { COMPARISON_ARMS } from "./comparison-record";
import buildComparisonReport from "./comparison-report";
import type { Immutable } from "./contracts";
import type { JudgeAgreementReport } from "./judge-agreement";
import {
	filterJudgeAgreementReport,
	loadJudgeAgreementReport,
} from "./judge-agreement";

/** The calibration agreement of each judge a stage comparison's arms used. */
async function comparisonJudgeAgreement(
	evidence: Immutable<ComparisonEvidence>,
	runsDirectory: string,
): Promise<JudgeAgreementReport> {
	return evidence.contract.mode === "session"
		? { baselines: [], skippedCalibrations: 0 }
		: filterJudgeAgreementReport(
				await loadJudgeAgreementReport(runsDirectory),
				evidence.cases.flatMap((benchmarkCase) =>
					COMPARISON_ARMS.flatMap((arm) => {
						const { group } = benchmarkCase.arms[arm];
						const { inputs } = group.record;
						if (!("judgeModel" in inputs)) {
							return [];
						}
						const { judgeModel } = inputs;
						return judgeModel === undefined ? [] : [judgeModel];
					}),
				),
			);
}

interface BuiltComparison {
	readonly evidence: ComparisonEvidence;
	readonly report: ComparisonReport;
}

/**
 * Loads a manifest's evidence and builds its report, telling `notice` of each
 * arm whose sessions read a file under test through the live install.
 */
async function buildComparison(
	manifestPath: string,
	runsDirectory: string,
	notice: (line: string) => void,
): Promise<BuiltComparison> {
	const evidence = await loadComparisonEvidence(manifestPath);
	const judgeAgreement = await comparisonJudgeAgreement(
		evidence,
		runsDirectory,
	);
	for (const line of liveReadNotices(evidence.cases)) {
		notice(line);
	}

	return {
		evidence,
		report: buildComparisonReport(evidence, judgeAgreement),
	};
}

export { buildComparison as default };
