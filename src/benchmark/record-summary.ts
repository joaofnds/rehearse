import { z } from "zod";
import { COMPARISON_ARMS } from "./comparison-record";
import type {
	ComparisonArm,
	ComparisonReport,
	LegacyComparisonReport,
	LegacySingleCaseComparisonReport,
	SingleCaseComparisonReport,
} from "./comparison-record";
import type {
	PairedEstimate,
	ProportionInterval,
	SingleCaseSpread,
} from "./comparison-estimator";
import type { ParsedConfirmationGroupRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";
import { corpusMeasurementReading } from "./corpus-version-label";

/**
 * The short markdown a session pastes onto a card. Each summary is a pure
 * function of one parsed record: no file is read and no clock is consulted, so
 * the same record renders the same bytes on every machine and a committed
 * expected string is a meaningful assertion.
 */
function table(
	header: readonly string[],
	rows: readonly (readonly string[])[],
): string[] {
	return [
		`| ${header.join(" | ")} |`,
		`| ${header.map(() => "---").join(" | ")} |`,
		...rows.map((row) => `| ${row.join(" | ")} |`),
	];
}

function usd(amount: number): string {
	return `$${amount.toFixed(2)}`;
}

function ratio(value: number): string {
	return value.toFixed(3);
}

function delta(value: number): string {
	return `${value >= 0 ? "+" : ""}${value.toFixed(3)}`;
}

/**
 * The run artifact carries no schema of its own, so the summary parses exactly
 * the fields it renders and fails loudly on a record that cannot supply them.
 * This is not a second record shape: `--json` still prints the artifact's own
 * bytes.
 */
export const runSummarySchema = z
	.object({
		caseId: z.string().min(1),
		timestamp: z.string().min(1),
		status: z.string().min(1),
		grade: z
			.object({ verdict: z.string().min(1), summary: z.string().min(1) })
			.loose()
			.optional(),
		failure: z.string().min(1).optional(),
		productOwnerCostUsd: z.number(),
		judgeCostUsd: z.number(),
		workflow: z.array(z.object({ costUsd: z.number() }).loose()),
		stageScorecards: z.array(
			z
				.object({
					stage: z.string().min(1),
					costUsd: z.number(),
					grade: z
						.object({
							grade: z.string().min(1),
							verdict: z.string().min(1),
						})
						.loose(),
				})
				.loose(),
		),
	})
	.loose();

export type RunSummaryRecord = Immutable<z.infer<typeof runSummarySchema>>;

export function parseRunSummaryRecord(text: string): RunSummaryRecord {
	return runSummarySchema.parse(JSON.parse(text));
}

export function runSummary(runName: string, record: RunSummaryRecord): string {
	const stageCost = record.stageScorecards.reduce(
		(total, scorecard) => total + scorecard.costUsd,
		0,
	);
	const workflowCost = record.workflow.reduce(
		(total, transcript) => total + transcript.costUsd,
		0,
	);
	const totalCost =
		stageCost + workflowCost + record.productOwnerCostUsd + record.judgeCostUsd;

	return [
		`## run:${runName}`,
		"",
		`Case ${record.caseId}, status ${record.status}.`,
		"",
		...table(
			["stage", "grade", "verdict", "cost"],
			record.stageScorecards.map((scorecard) => [
				scorecard.stage,
				scorecard.grade.grade,
				scorecard.grade.verdict,
				usd(scorecard.costUsd),
			]),
		),
		"",
		`Final verdict ${record.grade?.verdict ?? record.failure ?? "none"}.`,
		`Total cost ${usd(totalCost)}.`,
		"",
	].join("\n");
}

const reliabilitySummarySchema = z
	.object({
		name: z.string().min(1),
		requested: z.number(),
		successful: z.number(),
		successRate: z.number(),
		standardError: z.number(),
		passK: z.number(),
	})
	.loose();

export const groupReportSummarySchema = z
	.object({
		reliability: z.array(reliabilitySummarySchema),
		resources: z
			.object({
				total: z.object({ costUsd: z.array(z.number()) }).loose(),
				commandTotal: z
					.discriminatedUnion("status", [
						z.object({
							status: z.literal("COMPLETE"),
							metrics: z.object({ costUsd: z.number() }).loose(),
						}),
						z.object({
							status: z.literal("MISSING"),
							missing: z.array(z.string().min(1)),
						}),
					])
					.optional(),
			})
			.loose(),
	})
	.loose();

export type GroupReportSummaryRecord = Immutable<
	z.infer<typeof groupReportSummarySchema>
>;

export function parseGroupReportSummaryRecord(
	text: string,
): GroupReportSummaryRecord {
	return groupReportSummarySchema.parse(JSON.parse(text));
}

export function groupSummary(
	record: Immutable<ParsedConfirmationGroupRecord>,
	report: GroupReportSummaryRecord,
): string {
	const costs = report.resources.total.costUsd;
	const total = costs.reduce((sum, cost) => sum + cost, 0);
	const { commandTotal } = report.resources;
	let costLine = `Cost ${usd(total)} over ${String(costs.length)} reps.`;
	if (
		record.schemaVersion === 2 &&
		record.mode === "session" &&
		commandTotal === undefined
	) {
		costLine = "Cost unavailable: command total evidence is missing.";
	} else if (commandTotal?.status === "MISSING") {
		costLine = `Cost unavailable: ${commandTotal.missing.join(", ")}.`;
	} else if (commandTotal?.status === "COMPLETE") {
		costLine = `Cost ${usd(commandTotal.metrics.costUsd)} for the confirmed command.`;
	}

	return [
		`## group:${record.groupId}`,
		"",
		`Case ${record.caseId}, ${record.mode} mode, ${String(record.reps)} reps.`,
		`Corpus ${corpusMeasurementReading(record.inputs.corpusVersion)}.`,
		"",
		...table(
			["outcome", "successful", "success rate", "standard error", "pass^k"],
			report.reliability.map((summary) => [
				summary.name,
				`${String(summary.successful)}/${String(summary.requested)}`,
				ratio(summary.successRate),
				ratio(summary.standardError),
				ratio(summary.passK),
			]),
		),
		"",
		costLine,
		"",
	].join("\n");
}

function interval(arm: { readonly interval: ProportionInterval }): string {
	return `${ratio(arm.interval.low)}-${ratio(arm.interval.high)}`;
}

function spread(estimate: { readonly spread: SingleCaseSpread }): string {
	return estimate.spread.status === "ESTIMATED"
		? ratio(estimate.spread.standardError)
		: "no observed spread";
}

interface SingleCaseArmRow {
	readonly name: ComparisonArm;
	readonly successful: number;
	readonly requested: number;
	readonly rate: number;
	readonly interval: ProportionInterval;
	readonly passK: number;
}

/**
 * Each arm's own counts and interval, which the report carries only inside the
 * contrasts: every arm appears as the minuend or the subtrahend of at least one
 * of the three, and the three agree on any arm they share.
 */
function armProportions(
	report: Immutable<
		SingleCaseComparisonReport | LegacySingleCaseComparisonReport
	>,
): readonly SingleCaseArmRow[] {
	const rows = new Map<ComparisonArm, SingleCaseArmRow>();

	for (const contrast of Object.values(report.contrasts)) {
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

type ComparisonContrastName = keyof SingleCaseComparisonReport["contrasts"];
type SingleCaseContrast = Immutable<
	| SingleCaseComparisonReport["contrasts"][ComparisonContrastName]
	| LegacySingleCaseComparisonReport["contrasts"][ComparisonContrastName]
>;

/**
 * Elapsed time joins the cost table rather than taking one of its own, because
 * an operator comparing spend against speed reads one row per contrast. A
 * report written before version 5 carries no elapsed observation at all, which
 * is why its column renders unavailable instead of a zero delta.
 */
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

function singleCaseComparisonSummary(
	digest: string,
	report: Immutable<
		SingleCaseComparisonReport | LegacySingleCaseComparisonReport
	>,
): string {
	const [benchmarkCase] = report.cases;
	if (benchmarkCase === undefined) {
		throw new Error("A single-case comparison report carries no case");
	}

	const armRows = armProportions(report).map((arm) => [
		arm.name,
		`${String(arm.successful)}/${String(arm.requested)}`,
		ratio(arm.rate),
		interval(arm),
		ratio(arm.passK),
	]);
	const contrastRows = Object.values(report.contrasts).flatMap((contrast) =>
		contrast.quality.map((quality) => [
			`${contrast.minuend} − ${contrast.subtrahend}`,
			quality.name,
			delta(quality.successRate.delta),
			ratio(quality.successRate.standardError),
			delta(quality.passK.delta),
		]),
	);
	const resourceRows = Object.values(report.contrasts).map((contrast) =>
		resourceRow(contrast),
	);

	return [
		`## comparison:${digest}`,
		"",
		`1 case, ${report.mode} mode, ${String(report.reps)} reps.`,
		"",
		`Sampling unit: ${report.samplingUnit}. Arms are independent samples; this estimate covers case ${benchmarkCase.caseId} only.`,
		"",
		...table(
			["arm", "successful", "success rate", "95% interval", "pass^k"],
			armRows,
		),
		"",
		...table(
			["contrast", "outcome", "success rate Δ", "standard error", "pass^k Δ"],
			contrastRows,
		),
		"",
		...table(
			[
				"contrast",
				"cost Δ",
				"standard error",
				"per-attempt elapsed Δ (ms)",
				"standard error",
			],
			resourceRows,
		),
		"",
	].join("\n");
}

/**
 * A cost figure keeps six decimals where a success rate keeps three. The saved
 * comparison 511cd2c4 carries a candidate-minus-baseline cost standard error of
 * 0.0004999999999999172, which `ratio`'s three decimals render as "0.000", the
 * false certainty a rounded zero always claims. The boundary is narrow: an
 * error of 0.0005 exactly renders as "0.001" and would not have shown the
 * defect. Six decimals put the figure beyond that boundary rather than beside
 * it.
 */
function usdDelta(value: number): string {
	return `${value >= 0 ? "+" : ""}${value.toFixed(6)}`;
}

function usdRatio(value: number): string {
	return value.toFixed(6);
}

/**
 * A mean over cases describes the cases only when they agree on a direction.
 * Deltas of +0.5 and -0.5 average to exactly zero, which renders identically to
 * two cases that did not move, so the sign disagreement is reported beside the
 * mean rather than left for a reader to infer from a standard error.
 *
 * Sign is the test rather than the mean's distance from its standard error: a
 * genuinely null result also sits within one standard error of zero, and this
 * is reporting that the cases disagree, not that the mean is small.
 *
 * A delta of exactly zero counts as agreement. A case that did not move is not
 * evidence of conflict, so a strict comparison is deliberate on both sides:
 * relaxing either to `>=` or `<=` would report every flat case as a
 * disagreement.
 */
function caseDeltasDisagree(estimate: Immutable<PairedEstimate>): boolean {
	const values = estimate.caseDeltas.map(({ value }) => value);
	return values.some((value) => value > 0) && values.some((value) => value < 0);
}

function perCaseDeltas(
	estimate: Immutable<PairedEstimate>,
	format: (value: number) => string = delta,
): string {
	return estimate.caseDeltas
		.map(({ caseId, value }) => `${caseId} ${format(value)}`)
		.join(", ");
}

/**
 * Every paired delta the report carries, each beside the contrast against the
 * control arm, because a candidate that beats the baseline while both sit at
 * the control's rate has moved nothing.
 *
 * The per-case column and the cost table both read figures the report already
 * carries. Without them an operator reads a mean of zero as "the edit changed
 * nothing" where the cases in fact disagreed, and reads no cost at all.
 */
export function comparisonSummary(
	digest: string,
	report: Immutable<ComparisonReport | LegacyComparisonReport>,
): string {
	if ("samplingUnit" in report) {
		return singleCaseComparisonSummary(digest, report);
	}

	const rows = Object.values(report.contrasts).flatMap((contrast) =>
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

	const costRows = Object.values(report.contrasts).map((contrast) => {
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
	});

	return [
		`## comparison:${digest}`,
		"",
		`${String(report.cases.length)} cases, ${report.mode} mode, ${String(report.reps)} reps.`,
		"",
		...table(
			[
				"contrast",
				"outcome",
				"success rate Δ",
				"standard error",
				"pass^k Δ",
				"per-case Δ",
				"reading",
			],
			rows,
		),
		"",
		...table(
			["contrast", "cost Δ (USD)", "standard error", "per-case Δ"],
			costRows,
		),
		"",
	].join("\n");
}
