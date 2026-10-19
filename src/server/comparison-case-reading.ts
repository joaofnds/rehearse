import { armPairs, pairKey } from "#server/comparison-arm-pair";
import { comparisonAttempts } from "#server/comparison-attempts";
import { comparisonAttribution } from "#server/comparison-attribution";
import {
	figuresByArm,
	qualityReadingsByMeasure,
	scaleFor,
} from "#server/comparison-case-quality";
import type {
	AnyComparisonReport,
	ComparisonReportWithAttribution,
} from "#server/comparison-report-contract";
import comparisonSessionAssessment from "#server/comparison-session-assessment";
import caseSummary from "#server/comparison-summary";
import { whatMoved } from "#server/comparison-what-moved";

interface CaseComparisonReading {
	readonly caseId: string;
	readonly attribution: ComparisonReportWithAttribution["attribution"][string];
	readonly qualityReadings: ComparisonReportWithAttribution["qualityReadings"][string];
	readonly armFigures: ComparisonReportWithAttribution["armFigures"][string];
	readonly attempts: ComparisonReportWithAttribution["attempts"][string];
	readonly whatMoved: ComparisonReportWithAttribution["whatMoved"][string];
	readonly summary: ComparisonReportWithAttribution["summary"][string];
	readonly sessionAssessment:
		| NonNullable<ComparisonReportWithAttribution["sessionAssessments"]>[string]
		| undefined;
}

interface CaseComparisonInput {
	readonly report: AnyComparisonReport;
	readonly benchmarkCase: AnyComparisonReport["cases"][number];
	readonly measures: readonly string[];
}

type PairReadings = Pick<
	CaseComparisonReading,
	"attribution" | "qualityReadings"
>;

function casePairReadings({
	report,
	benchmarkCase,
	measures,
}: CaseComparisonInput): PairReadings {
	const byPair: Record<string, CaseComparisonReading["attribution"][string]> =
		{};
	const qualityByPair: Record<
		string,
		CaseComparisonReading["qualityReadings"][string]
	> = {};
	for (const names of armPairs()) {
		const { minuend, subtrahend } = names;
		const pair = pairKey(names);
		byPair[pair] = comparisonAttribution(
			benchmarkCase.arms[minuend].executedCorpus,
			benchmarkCase.arms[subtrahend].executedCorpus,
			report.mode,
		);
		qualityByPair[pair] = qualityReadingsByMeasure(report, benchmarkCase, {
			measures,
			minuend,
			subtrahend,
		});
	}

	return { attribution: byPair, qualityReadings: qualityByPair };
}

function caseComparisonReading(
	input: CaseComparisonInput,
): CaseComparisonReading {
	const { report, benchmarkCase, measures } = input;
	const { attribution: byPair, qualityReadings: qualityByPair } =
		casePairReadings(input);
	const caseFigures = figuresByArm(report, benchmarkCase);
	const caseAttempts = comparisonAttempts(benchmarkCase);
	const sessionAssessment =
		report.mode === "session"
			? comparisonSessionAssessment(caseAttempts)
			: undefined;
	const caseRows = whatMoved(benchmarkCase, caseFigures, {
		measures,
		qualityReadings: qualityByPair,
	});

	return {
		armFigures: caseFigures,
		attempts: caseAttempts,
		attribution: byPair,
		caseId: benchmarkCase.caseId,
		qualityReadings: qualityByPair,
		sessionAssessment,
		summary: caseSummary(
			benchmarkCase,
			{ quality: qualityByPair, whatMoved: caseRows },
			(measure) => scaleFor(report, measure),
		),
		whatMoved: caseRows,
	};
}

export { caseComparisonReading as default };
export type { CaseComparisonReading };
