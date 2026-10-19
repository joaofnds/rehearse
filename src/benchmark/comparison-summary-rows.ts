import type {
	PairedEstimate,
	ProportionInterval,
	SingleCaseSpread,
} from "./comparison-estimator";
import type {
	ComparisonArm,
	ComparisonReport,
	LegacyComparisonReport,
	LegacySingleCaseComparisonReport,
	SingleCaseComparisonReport,
} from "./comparison-record";
import { COMPARISON_ARMS } from "./comparison-record";
import type { Immutable } from "./contracts";
import { delta, ratio, usdDelta, usdRatio } from "./record-summary-format";

const NO_RATE_CHANGE = 0;

interface SingleCaseArmRow {
	readonly name: ComparisonArm;
	readonly successful: number;
	readonly requested: number;
	readonly rate: number;
	readonly interval: ProportionInterval;
	readonly passK: number;
}

type ComparisonContrastName = keyof SingleCaseComparisonReport["contrasts"];

const CONTRAST_ORDER: readonly ComparisonContrastName[] = [
	"candidateMinusBaseline",
	"candidateMinusControl",
	"baselineMinusControl",
];

type SingleCaseContrast = Immutable<
	| SingleCaseComparisonReport["contrasts"][ComparisonContrastName]
	| LegacySingleCaseComparisonReport["contrasts"][ComparisonContrastName]
>;

interface SingleCaseSummaryRows {
	readonly armRows: readonly (readonly string[])[];
	readonly contrastRows: readonly (readonly string[])[];
	readonly resourceRows: readonly (readonly string[])[];
}

interface PairedSummaryRows {
	readonly rows: readonly (readonly string[])[];
	readonly costRows: readonly (readonly string[])[];
}

function interval(arm: { readonly interval: ProportionInterval }): string {
	return `${ratio(arm.interval.low)}-${ratio(arm.interval.high)}`;
}

function spread(estimate: { readonly spread: SingleCaseSpread }): string {
	return estimate.spread.status === "ESTIMATED"
		? ratio(estimate.spread.standardError)
		: "no observed spread";
}

function armProportions(
	report: Immutable<
		SingleCaseComparisonReport | LegacySingleCaseComparisonReport
	>,
): readonly SingleCaseArmRow[] {
	const rows = new Map<ComparisonArm, SingleCaseArmRow>();

	for (const contrast of CONTRAST_ORDER.map((name) => report.contrasts[name])) {
		for (const quality of contrast.quality) {
			rows.set(contrast.minuend, {
				name: contrast.minuend,
				...quality.successRate.minuend,
				passK: quality.passK.minuend,
			});
			rows.set(contrast.subtrahend, {
				name: contrast.subtrahend,
				...quality.successRate.subtrahend,
				passK: quality.passK.subtrahend,
			});
		}
	}

	return COMPARISON_ARMS.flatMap((arm) => {
		const row = rows.get(arm);

		return row === undefined ? [] : [row];
	});
}

function resourceRow(contrast: SingleCaseContrast): readonly string[] {
	const name = `${contrast.minuend} − ${contrast.subtrahend}`;
	const { resources } = contrast;
	if (resources.status === "UNAVAILABLE") {
		return [name, "unavailable", "unavailable", "unavailable", "unavailable"];
	}

	const cost = [
		delta(resources.total.costUsd.delta),
		spread(resources.total.costUsd),
	];
	if (!("elapsedMs" in resources)) {
		return [name, ...cost, "unavailable", "unavailable"];
	}

	return [
		name,
		...cost,
		delta(resources.elapsedMs.delta),
		spread(resources.elapsedMs),
	];
}

function caseDeltasDisagree(estimate: Immutable<PairedEstimate>): boolean {
	const values = estimate.caseDeltas.map(({ value }) => value);
	return (
		values.some((value) => value > NO_RATE_CHANGE) &&
		values.some((value) => value < NO_RATE_CHANGE)
	);
}

function perCaseDeltas(
	estimate: Immutable<PairedEstimate>,
	format: (value: number) => string = delta,
): string {
	return estimate.caseDeltas
		.map(({ caseId, value }) => `${caseId} ${format(value)}`)
		.join(", ");
}

function singleCaseSummaryRows(
	report: Immutable<
		SingleCaseComparisonReport | LegacySingleCaseComparisonReport
	>,
): SingleCaseSummaryRows {
	const armRows = armProportions(report).map((arm) => [
		arm.name,
		`${String(arm.successful)}/${String(arm.requested)}`,
		ratio(arm.rate),
		interval(arm),
		ratio(arm.passK),
	]);
	const contrastRows = CONTRAST_ORDER.map(
		(name) => report.contrasts[name],
	).flatMap((contrast) =>
		contrast.quality.map((quality) => [
			`${contrast.minuend} − ${contrast.subtrahend}`,
			quality.name,
			delta(quality.successRate.delta),
			ratio(quality.successRate.standardError),
			delta(quality.passK.delta),
		]),
	);
	const resourceRows = CONTRAST_ORDER.map((name) => report.contrasts[name]).map(
		(contrast) => resourceRow(contrast),
	);
	return { armRows, contrastRows, resourceRows };
}

function pairedSummaryRows(
	report: Immutable<
		Exclude<
			ComparisonReport | LegacyComparisonReport,
			SingleCaseComparisonReport | LegacySingleCaseComparisonReport
		>
	>,
): PairedSummaryRows {
	const rows = CONTRAST_ORDER.map((name) => report.contrasts[name]).flatMap(
		(contrast) =>
			contrast.quality.map((quality) => [
				`${contrast.minuend} − ${contrast.subtrahend}`,
				quality.name,
				delta(quality.successRate.meanDelta),
				ratio(quality.successRate.standardError),
				delta(quality.passK.meanDelta),
				perCaseDeltas(quality.successRate),
				caseDeltasDisagree(quality.successRate) ? "cases disagree" : "",
			]),
	);

	const costRows = CONTRAST_ORDER.map((name) => report.contrasts[name]).map(
		(contrast) => {
			const name = `${contrast.minuend} − ${contrast.subtrahend}`;
			const { resources } = contrast;
			if (resources.status === "UNAVAILABLE") {
				return [name, "unavailable", "unavailable", "unavailable"];
			}

			const { costUsd } = resources.total;
			return [
				name,
				usdDelta(costUsd.meanDelta),
				usdRatio(costUsd.standardError),
				perCaseDeltas(costUsd, usdDelta),
			];
		},
	);
	return { costRows, rows };
}

export { interval, pairedSummaryRows, singleCaseSummaryRows };
