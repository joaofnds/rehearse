import type {
	ReliabilityOutcome,
	ReliabilitySummary,
} from "./confirmation-report";
import { buildReliabilityOutcomes } from "./confirmation-report";
import type {
	ComparisonArmEvidence,
	ComparisonEvidence,
	ComparisonProjectionInput,
} from "./comparison-evidence";
import { COMPARISON_CONTRASTS } from "./comparison-estimator";
import type { JudgeAgreementReport } from "./judge-agreement";
import type {
	ComparisonQualityCase,
	ComparisonQualityReport,
	QualityContrastEstimate,
	SingleCaseComparisonQualityReport,
	SingleCaseQualityContrastEstimate,
} from "./comparison-quality";
import {
	buildComparisonQuality,
	comparisonReliabilityRep,
} from "./comparison-quality";
import type { ComparisonArm, ComparisonReport } from "./comparison-record";
import { comparisonReportSchema } from "./comparison-record";
import type {
	ArmResources,
	ComparisonResourceCase,
	ComparisonResourcesReport,
	ContrastResources,
	SingleCaseComparisonResourcesReport,
	SingleCaseContrastResources,
} from "./comparison-resources";
import { buildComparisonResources } from "./comparison-resources";
import type { Immutable } from "./contracts";
import type { SessionAttemptRecord } from "./session-record";
import type { StateResult } from "./session-state-check";

interface RepCheckScore {
	readonly passed: number;
	readonly declared: number;
	readonly failing: readonly {
		readonly index: number;
		readonly kind: string;
		readonly detail: string;
	}[];
}

interface RepStateScore {
	readonly passed: number;
	readonly declared: number;
	readonly failing: readonly {
		readonly name: string;
		readonly detail: string;
	}[];
}

type ComparisonQualityContrastEstimates = readonly QualityContrastEstimate[];
type SingleCaseQualityContrastEstimates =
	readonly SingleCaseQualityContrastEstimate[];

function reportQualityCase(
	report: Immutable<
		ComparisonQualityReport | SingleCaseComparisonQualityReport
	>,
	caseId: string,
): Immutable<ComparisonQualityCase> {
	const benchmarkCase = report.cases.find(
		(candidate) => candidate.caseId === caseId,
	);
	if (benchmarkCase === undefined) {
		throw new Error(`Quality report has no case ${caseId}`);
	}

	return benchmarkCase;
}

function reportResourceCase(
	report: Immutable<
		ComparisonResourcesReport | SingleCaseComparisonResourcesReport
	>,
	caseId: string,
): Immutable<ComparisonResourceCase> {
	const benchmarkCase = report.cases.find(
		(candidate) => candidate.caseId === caseId,
	);
	if (benchmarkCase === undefined) {
		throw new Error(`Resource report has no case ${caseId}`);
	}

	return benchmarkCase;
}

interface BuildReportArmRequest {
	readonly evidence: ComparisonArmEvidence;
	readonly contract: ComparisonProjectionInput["contract"];
	readonly quality: readonly ReliabilitySummary[];
	readonly resources: ArmResources;
}

interface BuiltReportArm {
	readonly role: ComparisonArm;
	readonly source: {
		readonly group: { readonly path: string; readonly sha256: string };
		readonly reps: readonly {
			readonly repId: string;
			readonly ordinal: number;
			readonly path: string;
			readonly sha256: string;
			readonly outcomes: readonly ReliabilityOutcome[];
			readonly attempt?:
				| { readonly path: string; readonly sha256: string }
				| undefined;
			readonly checks?: RepCheckScore | undefined;
			readonly stateResults?: RepStateScore | undefined;
		}[];
	};
	readonly executedCorpus: readonly {
		readonly path: string;
		readonly sha256: string;
	}[];
	readonly quality: readonly ReliabilitySummary[];
	readonly resources: ArmResources;
}

/**
 * The per-check tally beside the rep's pass or fail grade. A grade of F says
 * nothing about whether one check failed or all of them, and a check result
 * carries no name, so a failing check is identified by its position in the
 * case's declaration list together with its kind.
 */
function repCheckScore(
	attempt: Immutable<SessionAttemptRecord>,
): RepCheckScore {
	const failing = attempt.checks.flatMap((check, index) =>
		check.status === "FAIL"
			? [{ index, kind: check.kind, detail: check.detail }]
			: [],
	);

	return {
		passed: attempt.checks.length - failing.length,
		declared: attempt.checks.length,
		failing,
	};
}

interface RepStateScoreField {
	readonly stateResults?: RepStateScore | undefined;
}

function repStateScoreField(
	attempt: Immutable<SessionAttemptRecord>,
): RepStateScoreField {
	if (!("stateResults" in attempt) || attempt.stateResults === undefined) {
		return {};
	}

	return { stateResults: repStateScore(attempt.stateResults) };
}

function repStateScore(
	results: readonly Immutable<StateResult>[],
): RepStateScore {
	const failing = results.flatMap((result) =>
		result.status === "FAIL"
			? [{ name: result.name, detail: result.detail }]
			: [],
	);

	return {
		passed: results.length - failing.length,
		declared: results.length,
		failing,
	};
}

function buildReportArm(
	request: Immutable<BuildReportArmRequest>,
): BuiltReportArm {
	const reps = request.evidence.reps.map((rep) => {
		const outcomes = buildReliabilityOutcomes(
			request.contract.declaredStages,
			comparisonReliabilityRep(request.contract, rep.record),
		);
		const source = {
			repId: rep.record.repId,
			ordinal: rep.record.ordinal,
			path: rep.path,
			sha256: rep.sha256,
			outcomes:
				request.contract.mode === "pipeline"
					? outcomes
					: outcomes.slice(0, request.contract.declaredStages.length),
		};
		if (rep.attempt === undefined) {
			return source;
		}

		return {
			...source,
			attempt: {
				path: rep.attempt.path,
				sha256: rep.attempt.sha256,
			},
			checks: repCheckScore(rep.attempt.record),
			...repStateScoreField(rep.attempt.record),
		};
	});

	return {
		role: request.evidence.role,
		source: {
			group: {
				path: request.evidence.group.path,
				sha256: request.evidence.group.sha256,
			},
			reps,
		},
		executedCorpus: request.evidence.executedCorpus.map(({ path, sha256 }) => ({
			path,
			sha256,
		})),
		quality: request.quality,
		resources: request.resources,
	};
}

interface ReportContrastInput {
	readonly minuend: ComparisonArm;
	readonly subtrahend: ComparisonArm;
	readonly quality:
		| ComparisonQualityContrastEstimates
		| SingleCaseQualityContrastEstimates;
	readonly resources: ContrastResources | SingleCaseContrastResources;
}

export function buildComparisonReport(
	evidence: Immutable<ComparisonEvidence>,
	judgeAgreement: Immutable<JudgeAgreementReport>,
): ComparisonReport {
	const reportInput: ComparisonProjectionInput = {
		contract: evidence.contract,
		cases: evidence.cases.map((benchmarkCase) => ({
			caseId: benchmarkCase.caseId,
			arms: {
				baseline: benchmarkCase.arms.baseline.reps.map(({ record }) => record),
				candidate: benchmarkCase.arms.candidate.reps.map(
					({ record }) => record,
				),
				control: benchmarkCase.arms.control.reps.map(({ record }) => record),
			},
		})),
	};
	const quality = buildComparisonQuality(reportInput);
	const resources = buildComparisonResources(reportInput);
	const contrast = (
		definition: (typeof COMPARISON_CONTRASTS)[number],
	): ReportContrastInput => ({
		minuend: definition.minuend,
		subtrahend: definition.subtrahend,
		quality: quality.contrasts[definition.name].quality,
		resources: resources.contrasts[definition.name].resources,
	});
	const cases = evidence.cases.map((benchmarkCase) => {
		const caseQuality = reportQualityCase(quality, benchmarkCase.caseId);
		const caseResources = reportResourceCase(resources, benchmarkCase.caseId);

		return {
			caseId: benchmarkCase.caseId,
			arms: {
				baseline: buildReportArm({
					evidence: benchmarkCase.arms.baseline,
					contract: evidence.contract,
					quality: caseQuality.arms.baseline,
					resources: caseResources.arms.baseline,
				}),
				candidate: buildReportArm({
					evidence: benchmarkCase.arms.candidate,
					contract: evidence.contract,
					quality: caseQuality.arms.candidate,
					resources: caseResources.arms.candidate,
				}),
				control: buildReportArm({
					evidence: benchmarkCase.arms.control,
					contract: evidence.contract,
					quality: caseQuality.arms.control,
					resources: caseResources.arms.control,
				}),
			},
		};
	});
	const common = {
		schemaVersion: 4 as const,
		judgeAgreement,
		manifest: { sha256: evidence.manifest.sha256 },
		mode: evidence.contract.mode,
		declaredStages: evidence.contract.declaredStages,
		reps: evidence.contract.reps,
		cases,
		contrasts: {
			candidateMinusBaseline: contrast(COMPARISON_CONTRASTS[0]),
			candidateMinusControl: contrast(COMPARISON_CONTRASTS[1]),
			baselineMinusControl: contrast(COMPARISON_CONTRASTS[2]),
		},
	};
	if ("samplingUnit" in quality) {
		return comparisonReportSchema.parse({
			...common,
			samplingUnit: quality.samplingUnit,
		});
	}

	return comparisonReportSchema.parse(common);
}
