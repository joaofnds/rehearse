import { z } from "zod";
import type { Immutable } from "./contracts";
import { stageLetterGradeSchema } from "./contracts";
import { summarizeReliabilityOutcomes } from "./confirmation-report";
import { judgeAgreementReportSchema } from "./judge-agreement";

export const COMPARISON_ARMS = ["baseline", "candidate", "control"] as const;
export type ComparisonArm = (typeof COMPARISON_ARMS)[number];
const comparisonArmSchema = z.enum(COMPARISON_ARMS);
const comparisonModeSchema = z.enum(["stage", "pipeline"]);

const identitySchema = z
	.string()
	.regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u, "Invalid comparison identity");

export const comparisonManifestSchema = z
	.object({
		schemaVersion: z.literal(1),
		cases: z
			.array(
				z
					.object({
						caseId: identitySchema,
						arms: z
							.object({
								baseline: z.string().min(1),
								candidate: z.string().min(1),
								control: z.string().min(1),
							})
							.strict(),
					})
					.strict(),
			)
			.min(1),
	})
	.strict()
	.superRefine((manifest, context) => {
		const seen = new Set<string>();
		for (const [index, benchmarkCase] of manifest.cases.entries()) {
			if (seen.has(benchmarkCase.caseId)) {
				context.addIssue({
					code: "custom",
					message: "duplicate case ID",
					path: ["cases", index, "caseId"],
				});
			}

			seen.add(benchmarkCase.caseId);
		}
	});

export type ComparisonManifest = Immutable<
	z.infer<typeof comparisonManifestSchema>
>;

const manifestContextSchema = z
	.object({
		cases: z
			.array(z.object({ caseId: z.string().optional() }).loose())
			.optional(),
	})
	.loose();
type ManifestContext = Immutable<z.infer<typeof manifestContextSchema>>;

const caseIssuePathSchema = z
	.tuple([z.literal("cases"), z.number().int().nonnegative()])
	.rest(z.union([z.string(), z.number()]));

interface IssueContextInput {
	readonly context: ManifestContext;
	readonly issue: {
		readonly path: readonly PropertyKey[];
	};
}

interface ManifestIssueContext {
	readonly caseId: string;
	readonly arm: string;
	readonly field: string;
}

function issueContext(
	input: Immutable<IssueContextInput>,
): ManifestIssueContext {
	const parsedPath = caseIssuePathSchema.safeParse(input.issue.path);
	const caseIndex = parsedPath.data?.[1];
	const caseId =
		caseIndex === undefined
			? "manifest"
			: (input.context.cases?.[caseIndex]?.caseId ?? `case-${caseIndex + 1}`);
	const arm = input.issue.path
		.map((value) => comparisonArmSchema.safeParse(value))
		.find((result) => result.success)?.data;
	const fieldPath =
		caseIndex === undefined ? input.issue.path : input.issue.path.slice(2);
	const field = fieldPath.map(String).join(".") || "manifest";

	return { caseId, arm: arm ?? "all", field };
}

export class ComparisonManifestError extends Error {
	public override name = "ComparisonManifestError";
}

export function parseComparisonManifest(text: string): ComparisonManifest {
	let candidate: unknown;
	try {
		candidate = JSON.parse(text);
	} catch {
		throw new ComparisonManifestError(
			"case manifest arm all field json: invalid JSON",
		);
	}

	const result = comparisonManifestSchema.safeParse(candidate);
	if (result.success) {
		return result.data;
	}

	const [issue] = result.error.issues;
	if (issue === undefined) {
		throw new ComparisonManifestError(
			"case manifest arm all field manifest: invalid comparison manifest",
		);
	}

	const parsedContext = manifestContextSchema.safeParse(candidate);
	const context = issueContext({
		context: parsedContext.success ? parsedContext.data : {},
		issue,
	});

	throw new ComparisonManifestError(
		`case ${context.caseId} arm ${context.arm} field ${context.field}: ${issue.message}`,
	);
}

const sha256Schema = z
	.string()
	.regex(/^[0-9a-f]{64}$/u, "Invalid SHA-256 digest");
const digestedPathSchema = z
	.object({ path: z.string().min(1), sha256: sha256Schema })
	.strict();
const sourceRepSchema = digestedPathSchema
	.extend({
		repId: identitySchema,
		ordinal: z.number().int().positive(),
		attempt: digestedPathSchema.optional(),
	})
	.strict();
const sessionSourceRepSchema = digestedPathSchema
	.extend({
		repId: identitySchema,
		ordinal: z.number().int().positive(),
		attempt: digestedPathSchema,
	})
	.strict();
const judgedRepOutcomeSchema = z
	.object({
		name: z.string().min(1),
		status: z.literal("JUDGED"),
		grade: z.union([stageLetterGradeSchema, z.enum(["PASS", "FAIL"])]),
		successful: z.boolean(),
	})
	.strict();
const unjudgedRepOutcomeSchema = z
	.object({
		name: z.string().min(1),
		status: z.enum(["EXECUTION_FAILED", "METRICS_MISSING", "NOT_REACHED"]),
		successful: z.literal(false),
	})
	.strict();
const repOutcomeSchema = z.union([
	judgedRepOutcomeSchema,
	unjudgedRepOutcomeSchema,
]);
const currentSourceRepSchema = sourceRepSchema
	.extend({ outcomes: z.array(repOutcomeSchema).min(1) })
	.strict();
const currentSessionSourceRepSchema = sessionSourceRepSchema
	.extend({ outcomes: z.array(repOutcomeSchema).min(1) })
	.strict();
const reliabilitySummarySchema = z
	.object({
		name: z.string().min(1),
		requested: z.number().int().positive(),
		attempted: z.number().int().nonnegative(),
		notReached: z.number().int().nonnegative(),
		failed: z.number().int().nonnegative(),
		successful: z.number().int().nonnegative(),
		gradeDistribution: z.record(
			z.string().min(1),
			z.number().int().nonnegative(),
		),
		successRate: z.number().min(0).max(1),
		standardError: z.number().nonnegative(),
		passK: z.number().min(0).max(1),
	})
	.strict();
const caseDeltaSchema = z
	.object({ caseId: identitySchema, value: z.number() })
	.strict();
const pairedEstimateSchema = z
	.object({
		caseDeltas: z.array(caseDeltaSchema).min(2),
		meanDelta: z.number(),
		standardError: z.number().nonnegative(),
	})
	.strict();
const metricValueSummarySchema = z
	.object({
		values: z.array(z.number().nonnegative()).min(1),
		mean: z.number().nonnegative(),
	})
	.strict();
const resourceMetricSummarySchema = z
	.object({
		costUsd: metricValueSummarySchema,
		inputTokens: metricValueSummarySchema,
		outputTokens: metricValueSummarySchema,
		cacheReadTokens: metricValueSummarySchema,
		cacheWriteTokens: metricValueSummarySchema,
	})
	.strict();
const resourceRolesSummarySchema = z
	.object({
		worker: resourceMetricSummarySchema,
		"product-owner": resourceMetricSummarySchema,
		"stage-judge": resourceMetricSummarySchema,
		"final-judge": resourceMetricSummarySchema,
	})
	.strict();
const missingResourceEvidenceSchema = z
	.object({
		repId: identitySchema,
		ordinal: z.number().int().positive(),
		missing: z.array(z.string().min(1)).min(1),
	})
	.strict();
const armResourcesSchema = z.discriminatedUnion("status", [
	z
		.object({
			status: z.literal("AVAILABLE"),
			completeReps: z.number().int().positive(),
			missingMetricReps: z.literal(0),
			perRole: resourceRolesSummarySchema,
			total: resourceMetricSummarySchema,
			workerTurns: metricValueSummarySchema,
		})
		.strict(),
	z
		.object({
			status: z.literal("UNAVAILABLE"),
			completeReps: z.number().int().nonnegative(),
			missingMetricReps: z.number().int().positive(),
			missingEvidence: z.array(missingResourceEvidenceSchema).min(1),
		})
		.strict(),
]);
const reportArmSchema = z
	.object({
		role: comparisonArmSchema,
		source: z
			.object({
				group: digestedPathSchema,
				reps: z.array(sourceRepSchema).min(1),
			})
			.strict(),
		executedCorpus: z.array(digestedPathSchema).min(1),
		quality: z.array(reliabilitySummarySchema).min(1),
		resources: armResourcesSchema,
	})
	.strict();
const sessionReportArmSchema = z
	.object({
		role: comparisonArmSchema,
		source: z
			.object({
				group: digestedPathSchema,
				reps: z.array(sessionSourceRepSchema).min(1),
			})
			.strict(),
		executedCorpus: z.array(digestedPathSchema),
		quality: z.array(reliabilitySummarySchema).min(1),
		resources: armResourcesSchema,
	})
	.strict();
const currentReportArmSchema = reportArmSchema
	.extend({
		source: z
			.object({
				group: digestedPathSchema,
				reps: z.array(currentSourceRepSchema).min(1),
			})
			.strict(),
	})
	.strict();
const currentSessionReportArmSchema = sessionReportArmSchema
	.extend({
		source: z
			.object({
				group: digestedPathSchema,
				reps: z.array(currentSessionSourceRepSchema).min(1),
			})
			.strict(),
	})
	.strict();
const reportCaseSchema = z
	.object({
		caseId: identitySchema,
		arms: z
			.object({
				baseline: reportArmSchema,
				candidate: reportArmSchema,
				control: reportArmSchema,
			})
			.strict(),
	})
	.strict();
const sessionReportCaseSchema = z
	.object({
		caseId: identitySchema,
		arms: z
			.object({
				baseline: sessionReportArmSchema,
				candidate: sessionReportArmSchema,
				control: sessionReportArmSchema,
			})
			.strict(),
	})
	.strict();
const currentReportCaseSchema = reportCaseSchema
	.extend({
		arms: z
			.object({
				baseline: currentReportArmSchema,
				candidate: currentReportArmSchema,
				control: currentReportArmSchema,
			})
			.strict(),
	})
	.strict();
const currentSessionReportCaseSchema = sessionReportCaseSchema
	.extend({
		arms: z
			.object({
				baseline: currentSessionReportArmSchema,
				candidate: currentSessionReportArmSchema,
				control: currentSessionReportArmSchema,
			})
			.strict(),
	})
	.strict();
const qualityContrastSchema = z
	.object({
		name: z.string().min(1),
		successRate: pairedEstimateSchema,
		passK: pairedEstimateSchema,
	})
	.strict();
const resourceMetricEstimatesSchema = z
	.object({
		costUsd: pairedEstimateSchema,
		inputTokens: pairedEstimateSchema,
		outputTokens: pairedEstimateSchema,
		cacheReadTokens: pairedEstimateSchema,
		cacheWriteTokens: pairedEstimateSchema,
	})
	.strict();
const resourceRolesEstimatesSchema = z
	.object({
		worker: resourceMetricEstimatesSchema,
		"product-owner": resourceMetricEstimatesSchema,
		"stage-judge": resourceMetricEstimatesSchema,
		"final-judge": resourceMetricEstimatesSchema,
	})
	.strict();
const contrastResourcesSchema = z.discriminatedUnion("status", [
	z
		.object({
			status: z.literal("AVAILABLE"),
			perRole: resourceRolesEstimatesSchema,
			total: resourceMetricEstimatesSchema,
			workerTurns: pairedEstimateSchema,
		})
		.strict(),
	z
		.object({
			status: z.literal("UNAVAILABLE"),
			missingEvidence: z
				.array(
					missingResourceEvidenceSchema
						.extend({ caseId: identitySchema, arm: comparisonArmSchema })
						.strict(),
				)
				.min(1),
		})
		.strict(),
]);
const reportContrastSchema = z
	.object({
		minuend: comparisonArmSchema,
		subtrahend: comparisonArmSchema,
		quality: z.array(qualityContrastSchema).min(1),
		resources: contrastResourcesSchema,
	})
	.strict();

const proportionIntervalSchema = z
	.object({ low: z.number().min(0).max(1), high: z.number().min(0).max(1) })
	.strict();
const singleCaseArmProportionSchema = z
	.object({
		successful: z.number().int().nonnegative(),
		requested: z.number().int().positive(),
		rate: z.number().min(0).max(1),
		interval: proportionIntervalSchema,
	})
	.strict();
const singleCaseProportionEstimateSchema = z
	.object({
		minuend: singleCaseArmProportionSchema,
		subtrahend: singleCaseArmProportionSchema,
		delta: z.number().min(-1).max(1),
		standardError: z.number().nonnegative(),
	})
	.strict();
const singleCasePassKSchema = z
	.object({
		minuend: z.number().min(0).max(1),
		subtrahend: z.number().min(0).max(1),
		delta: z.number().min(-1).max(1),
	})
	.strict();
const singleCaseQualityContrastSchema = z
	.object({
		name: z.string().min(1),
		successRate: singleCaseProportionEstimateSchema,
		passK: singleCasePassKSchema,
	})
	.strict();
const singleCaseSpreadSchema = z.discriminatedUnion("status", [
	z.object({ status: z.literal("NO_OBSERVED_SPREAD") }).strict(),
	z
		.object({
			status: z.literal("ESTIMATED"),
			standardError: z.number().nonnegative(),
		})
		.strict(),
]);
const singleCaseArmMeanSchema = z
	.object({
		values: z.array(z.number().nonnegative()).min(1),
		mean: z.number().nonnegative(),
	})
	.strict();
const singleCaseMeanEstimateSchema = z
	.object({
		minuend: singleCaseArmMeanSchema,
		subtrahend: singleCaseArmMeanSchema,
		delta: z.number(),
		spread: singleCaseSpreadSchema,
	})
	.strict();
const singleCaseResourceMetricEstimatesSchema = z
	.object({
		costUsd: singleCaseMeanEstimateSchema,
		inputTokens: singleCaseMeanEstimateSchema,
		outputTokens: singleCaseMeanEstimateSchema,
		cacheReadTokens: singleCaseMeanEstimateSchema,
		cacheWriteTokens: singleCaseMeanEstimateSchema,
	})
	.strict();
const singleCaseResourceRolesEstimatesSchema = z
	.object({
		worker: singleCaseResourceMetricEstimatesSchema,
		"product-owner": singleCaseResourceMetricEstimatesSchema,
		"stage-judge": singleCaseResourceMetricEstimatesSchema,
		"final-judge": singleCaseResourceMetricEstimatesSchema,
	})
	.strict();
const singleCaseContrastResourcesSchema = z.discriminatedUnion("status", [
	z
		.object({
			status: z.literal("AVAILABLE"),
			perRole: singleCaseResourceRolesEstimatesSchema,
			total: singleCaseResourceMetricEstimatesSchema,
			workerTurns: singleCaseMeanEstimateSchema,
		})
		.strict(),
	z
		.object({
			status: z.literal("UNAVAILABLE"),
			missingEvidence: z
				.array(
					missingResourceEvidenceSchema
						.extend({ caseId: identitySchema, arm: comparisonArmSchema })
						.strict(),
				)
				.min(1),
		})
		.strict(),
]);
const singleCaseReportContrastSchema = z
	.object({
		minuend: comparisonArmSchema,
		subtrahend: comparisonArmSchema,
		quality: z.array(singleCaseQualityContrastSchema).min(1),
		resources: singleCaseContrastResourcesSchema,
	})
	.strict();

const comparisonReportFields = {
	manifest: z.object({ sha256: sha256Schema }).strict(),
	mode: comparisonModeSchema,
	declaredStages: z.array(z.string().min(1)).min(1),
	reps: z.number().int().min(2),
	cases: z.array(reportCaseSchema).min(2),
	contrasts: z
		.object({
			candidateMinusBaseline: reportContrastSchema,
			candidateMinusControl: reportContrastSchema,
			baselineMinusControl: reportContrastSchema,
		})
		.strict(),
};
const legacyComparisonReportSchema = z
	.object({ schemaVersion: z.literal(1), ...comparisonReportFields })
	.strict();
const versionTwoComparisonReportSchema = z
	.object({
		schemaVersion: z.literal(2),
		judgeAgreement: judgeAgreementReportSchema,
		...comparisonReportFields,
	})
	.strict();

/**
 * Session comparisons carry the attempt artifact beside each rep and have no
 * judge calibration. Keeping that distinction in the report version prevents
 * consumers from mistaking a worker check for a pipeline judge outcome.
 */
const versionThreeSessionComparisonReportSchema = z
	.object({
		schemaVersion: z.literal(3),
		judgeAgreement: judgeAgreementReportSchema.extend({
			baselines: z.array(z.never()).length(0),
		}),
		...comparisonReportFields,
		mode: z.literal("session"),
		declaredStages: z.tuple([z.literal("checks")]),
		cases: z.array(sessionReportCaseSchema).min(2),
	})
	.strict();

const currentStageComparisonReportSchema = z
	.object({
		schemaVersion: z.literal(4),
		judgeAgreement: judgeAgreementReportSchema,
		...comparisonReportFields,
		mode: z.literal("stage"),
		cases: z.array(currentReportCaseSchema).min(2),
	})
	.strict();
const currentPipelineComparisonReportSchema = z
	.object({
		schemaVersion: z.literal(4),
		judgeAgreement: judgeAgreementReportSchema,
		...comparisonReportFields,
		mode: z.literal("pipeline"),
		cases: z.array(currentReportCaseSchema).min(2),
	})
	.strict();
const currentSessionComparisonReportSchema = z
	.object({
		schemaVersion: z.literal(4),
		judgeAgreement: judgeAgreementReportSchema.extend({
			baselines: z.array(z.never()).length(0),
		}),
		...comparisonReportFields,
		mode: z.literal("session"),
		declaredStages: z.tuple([z.literal("checks")]),
		cases: z.array(currentSessionReportCaseSchema).min(2),
	})
	.strict();

const currentSingleCaseSessionComparisonReportSchema = z
	.object({
		schemaVersion: z.literal(4),
		judgeAgreement: judgeAgreementReportSchema.extend({
			baselines: z.array(z.never()).length(0),
		}),
		...comparisonReportFields,
		mode: z.literal("session"),
		declaredStages: z.tuple([z.literal("checks")]),
		samplingUnit: z.literal("rep"),
		cases: z.tuple([currentSessionReportCaseSchema]),
		contrasts: z
			.object({
				candidateMinusBaseline: singleCaseReportContrastSchema,
				candidateMinusControl: singleCaseReportContrastSchema,
				baselineMinusControl: singleCaseReportContrastSchema,
			})
			.strict(),
	})
	.strict();

const currentComparisonReportSchema = z.union([
	currentStageComparisonReportSchema,
	currentPipelineComparisonReportSchema,
	currentSessionComparisonReportSchema,
	currentSingleCaseSessionComparisonReportSchema,
]);

type CurrentComparisonReport = Immutable<
	z.infer<typeof currentComparisonReportSchema>
>;
type CurrentReportArm =
	CurrentComparisonReport["cases"][number]["arms"][ComparisonArm];
type CurrentRepOutcome =
	CurrentReportArm["source"]["reps"][number]["outcomes"][number];
type CurrentJudgedRepOutcome = Extract<
	CurrentRepOutcome,
	{ readonly status: "JUDGED" }
>;

interface ReportRefinementContext {
	readonly addIssue: z.RefinementCtx["addIssue"];
}

function sameStrings(
	left: readonly string[],
	right: readonly string[],
): boolean {
	return (
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}

function sameDistribution(
	left: Readonly<Record<string, number>>,
	right: Readonly<Record<string, number>>,
): boolean {
	const leftEntries = Object.entries(left).toSorted(([leftName], [rightName]) =>
		leftName.localeCompare(rightName),
	);
	const rightEntries = Object.entries(right).toSorted(
		([leftName], [rightName]) => leftName.localeCompare(rightName),
	);

	return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}

function expectedOutcomeNames(
	report: CurrentComparisonReport,
): readonly string[] {
	return report.mode === "pipeline"
		? [...report.declaredStages, "final"]
		: report.declaredStages;
}

function judgedOutcomeMatchesMode(
	report: CurrentComparisonReport,
	outcome: CurrentJudgedRepOutcome,
): boolean {
	if (report.mode === "session") {
		return (
			(outcome.grade === "A" || outcome.grade === "F") &&
			(!outcome.successful || outcome.grade === "A")
		);
	}
	if (report.mode === "pipeline" && outcome.name === "final") {
		return (
			(outcome.grade === "PASS" || outcome.grade === "FAIL") &&
			(!outcome.successful || outcome.grade === "PASS")
		);
	}

	return (
		stageLetterGradeSchema.safeParse(outcome.grade).success &&
		(!outcome.successful || outcome.grade === "A" || outcome.grade === "B")
	);
}

function addReportIssue(
	context: ReportRefinementContext,
	path: readonly PropertyKey[],
	message: string,
): void {
	context.addIssue({ code: "custom", message, path: [...path] });
}

function validateArm(
	report: CurrentComparisonReport,
	arm: CurrentReportArm,
	path: readonly PropertyKey[],
	context: ReportRefinementContext,
): void {
	if (arm.source.reps.length !== report.reps) {
		addReportIssue(
			context,
			[...path, "source", "reps"],
			"rep count must match report reps",
		);
	}

	const repIds = arm.source.reps.map(({ repId }) => repId);
	if (new Set(repIds).size !== repIds.length) {
		addReportIssue(
			context,
			[...path, "source", "reps"],
			"rep IDs must be unique",
		);
	}

	const ordinals = arm.source.reps.map(({ ordinal }) => ordinal);
	const expectedOrdinals = Array.from(
		{ length: arm.source.reps.length },
		(_value, index) => index + 1,
	);
	if (!sameStrings(ordinals.map(String), expectedOrdinals.map(String))) {
		addReportIssue(
			context,
			[...path, "source", "reps"],
			"rep ordinals must cover report reps in order",
		);
	}

	const names = expectedOutcomeNames(report);
	if (
		!sameStrings(
			arm.quality.map(({ name }) => name),
			names,
		)
	) {
		addReportIssue(
			context,
			[...path, "quality"],
			"quality names must match report measures",
		);
	}

	for (const [repIndex, rep] of arm.source.reps.entries()) {
		if (
			!sameStrings(
				rep.outcomes.map(({ name }) => name),
				names,
			)
		) {
			addReportIssue(
				context,
				[...path, "source", "reps", repIndex, "outcomes"],
				"outcome names must match report measures",
			);
		}

		for (const [outcomeIndex, outcome] of rep.outcomes.entries()) {
			if (
				outcome.status === "JUDGED" &&
				!judgedOutcomeMatchesMode(report, outcome)
			) {
				addReportIssue(
					context,
					[
						...path,
						"source",
						"reps",
						repIndex,
						"outcomes",
						outcomeIndex,
						"grade",
					],
					"judged grade and success must match the comparison mode and measure",
				);
			}
		}
	}

	for (const [qualityIndex, summary] of arm.quality.entries()) {
		const outcomes = arm.source.reps
			.map((rep) => rep.outcomes[qualityIndex])
			.filter((outcome) => outcome !== undefined);
		const expected = summarizeReliabilityOutcomes(summary.name, outcomes);
		const summaryPath = [...path, "quality", qualityIndex];

		for (const key of [
			"requested",
			"attempted",
			"notReached",
			"failed",
			"successful",
			"successRate",
			"standardError",
			"passK",
		] as const) {
			if (summary[key] !== expected[key]) {
				addReportIssue(
					context,
					[...summaryPath, key],
					`${key} must match per-rep outcomes`,
				);
			}
		}

		if (
			!sameDistribution(summary.gradeDistribution, expected.gradeDistribution)
		) {
			addReportIssue(
				context,
				[...summaryPath, "gradeDistribution"],
				"grade distribution must match per-rep outcomes",
			);
		}
	}
}

export const comparisonReportSchema = currentComparisonReportSchema.superRefine(
	(report, context) => {
		for (const [caseIndex, benchmarkCase] of report.cases.entries()) {
			for (const role of COMPARISON_ARMS) {
				validateArm(
					report,
					benchmarkCase.arms[role],
					["cases", caseIndex, "arms", role],
					context,
				);
			}
		}
	},
);

export type ComparisonReport = Immutable<
	z.infer<typeof comparisonReportSchema>
>;
export type SingleCaseComparisonReport = Immutable<
	z.infer<typeof currentSingleCaseSessionComparisonReportSchema>
>;
export type MultiCaseComparisonReport = Immutable<
	| z.infer<typeof currentStageComparisonReportSchema>
	| z.infer<typeof currentPipelineComparisonReportSchema>
	| z.infer<typeof currentSessionComparisonReportSchema>
>;
export type LegacyComparisonReport = Immutable<
	| z.infer<typeof legacyComparisonReportSchema>
	| z.infer<typeof versionTwoComparisonReportSchema>
	| z.infer<typeof versionThreeSessionComparisonReportSchema>
>;

export function parseComparisonReport(
	text: string,
): ComparisonReport | LegacyComparisonReport {
	return z
		.union([
			legacyComparisonReportSchema,
			versionTwoComparisonReportSchema,
			versionThreeSessionComparisonReportSchema,
			comparisonReportSchema,
		])
		.parse(JSON.parse(text));
}

export function serializeComparisonReport(
	report: Immutable<ComparisonReport>,
): string {
	const parsed = comparisonReportSchema.parse(report);

	return `${JSON.stringify(parsed, null, 2)}\n`;
}
