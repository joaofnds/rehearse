import type { ComparisonArm } from "#benchmark/comparison-record";
import { reliabilitySummaryNamed } from "#benchmark/confirmation-report";
import { armFigures } from "#server/comparison-arm-figures";
import type {
	ArmFigures,
	CaseArmFigures,
} from "#server/comparison-arm-figures";
import qualityReading from "#server/comparison-quality-reading";
import type {
	QualityReading,
	QualityScale,
} from "#server/comparison-quality-reading";
import type { AnyComparisonReport } from "#server/comparison-report-contract";

function scaleFor(report: AnyComparisonReport, measure: string): QualityScale {
	return report.mode === "session" || measure === "final"
		? "successRate"
		: "letters";
}

interface QualityContrast {
	readonly minuend: ComparisonArm;
	readonly subtrahend: ComparisonArm;
	readonly measures: readonly string[];
}

function qualityReadingsByMeasure(
	report: AnyComparisonReport,
	benchmarkCase: AnyComparisonReport["cases"][number],
	{ minuend, subtrahend, measures }: QualityContrast,
): Readonly<Record<string, QualityReading>> {
	return Object.fromEntries(
		measures.map((name) => [
			name,
			qualityReading({
				minuend: reliabilitySummaryNamed(
					benchmarkCase.arms[minuend].quality,
					name,
				),
				minuendArm: minuend,
				scale: scaleFor(report, name),
				subtrahend: reliabilitySummaryNamed(
					benchmarkCase.arms[subtrahend].quality,
					name,
				),
				subtrahendArm: subtrahend,
			}),
		]),
	);
}

function figuresByArm(
	report: AnyComparisonReport,
	benchmarkCase: AnyComparisonReport["cases"][number],
): CaseArmFigures {
	const figuresOf = (arm: ComparisonArm): ArmFigures =>
		armFigures(benchmarkCase.arms[arm], (measure) => scaleFor(report, measure));

	return {
		baseline: figuresOf("baseline"),
		candidate: figuresOf("candidate"),
		control: figuresOf("control"),
	};
}

export { scaleFor, qualityReadingsByMeasure, figuresByArm };
