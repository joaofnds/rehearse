import { COMPARISON_CONTRASTS } from "./comparison-estimator";
import type {
	ComparisonEvidence,
	ComparisonProjectionInput,
} from "./comparison-evidence";
import type {
	ComparisonQualityCase,
	ComparisonQualityReport,
	QualityContrastEstimate,
	SingleCaseComparisonQualityReport,
	SingleCaseQualityContrastEstimate,
} from "./comparison-quality";
import { buildComparisonQuality } from "./comparison-quality";
import type { ComparisonArm, ComparisonReport } from "./comparison-record";
import {
	MULTIPLE_GROUPS_REPORT_SCHEMA_VERSION,
	comparisonReportSchema,
} from "./comparison-record";
import type { BuiltReportArm } from "./comparison-report-arm";
import { buildReportArm } from "./comparison-report-arm";
import type {
	ComparisonResourceCase,
	ComparisonResourcesReport,
	ContrastResources,
	SingleCaseComparisonResourcesReport,
	SingleCaseContrastResources,
} from "./comparison-resources";
import buildComparisonResources from "./comparison-resources";
import type { Immutable } from "./contracts";
import type { JudgeAgreementReport } from "./judge-agreement";

type ComparisonQualityContrastEstimates = readonly QualityContrastEstimate[];

type SingleCaseQualityContrastEstimates =
	readonly SingleCaseQualityContrastEstimate[];

interface ReportContrastInput {
	readonly minuend: ComparisonArm;
	readonly subtrahend: ComparisonArm;
	readonly quality:
		| ComparisonQualityContrastEstimates
		| SingleCaseQualityContrastEstimates;
	readonly resources: ContrastResources | SingleCaseContrastResources;
}

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

function projectReportInput(
	evidence: Immutable<ComparisonEvidence>,
): ComparisonProjectionInput {
	return {
		cases: evidence.cases.map((benchmarkCase) => ({
			arms: {
				baseline: benchmarkCase.arms.baseline.reps.map(({ record }) => record),
				candidate: benchmarkCase.arms.candidate.reps.map(
					({ record }) => record,
				),
				control: benchmarkCase.arms.control.reps.map(({ record }) => record),
			},
			caseId: benchmarkCase.caseId,
		})),
		contract: evidence.contract,
	};
}

function buildReportCases(
	evidence: Immutable<ComparisonEvidence>,
	quality: Immutable<
		ComparisonQualityReport | SingleCaseComparisonQualityReport
	>,
	resources: Immutable<
		ComparisonResourcesReport | SingleCaseComparisonResourcesReport
	>,
): readonly {
	readonly caseId: string;
	readonly arms: Readonly<Record<ComparisonArm, BuiltReportArm>>;
}[] {
	return evidence.cases.map((benchmarkCase) => {
		const caseQuality = reportQualityCase(quality, benchmarkCase.caseId);
		const caseResources = reportResourceCase(resources, benchmarkCase.caseId);

		return {
			arms: {
				baseline: buildReportArm({
					contract: evidence.contract,
					evidence: benchmarkCase.arms.baseline,
					quality: caseQuality.arms.baseline,
					resources: caseResources.arms.baseline,
				}),
				candidate: buildReportArm({
					contract: evidence.contract,
					evidence: benchmarkCase.arms.candidate,
					quality: caseQuality.arms.candidate,
					resources: caseResources.arms.candidate,
				}),
				control: buildReportArm({
					contract: evidence.contract,
					evidence: benchmarkCase.arms.control,
					quality: caseQuality.arms.control,
					resources: caseResources.arms.control,
				}),
			},
			caseId: benchmarkCase.caseId,
		};
	});
}

function buildComparisonReport(
	evidence: Immutable<ComparisonEvidence>,
	judgeAgreement: Immutable<JudgeAgreementReport>,
): ComparisonReport {
	const reportInput = projectReportInput(evidence);
	const quality = buildComparisonQuality(reportInput);
	const resources = buildComparisonResources(reportInput);
	const contrast = (
		definition: (typeof COMPARISON_CONTRASTS)[number],
	): ReportContrastInput => ({
		minuend: definition.minuend,
		quality: quality.contrasts[definition.name].quality,
		resources: resources.contrasts[definition.name].resources,
		subtrahend: definition.subtrahend,
	});
	const cases = buildReportCases(evidence, quality, resources);
	const [candidateMinusBaseline, candidateMinusControl, baselineMinusControl] =
		COMPARISON_CONTRASTS;
	const common = {
		cases,
		contrasts: {
			baselineMinusControl: contrast(baselineMinusControl),
			candidateMinusBaseline: contrast(candidateMinusBaseline),
			candidateMinusControl: contrast(candidateMinusControl),
		},
		declaredStages: evidence.contract.declaredStages,
		judgeAgreement,
		manifest: { sha256: evidence.manifest.sha256 },
		mode: evidence.contract.mode,
		reps: evidence.contract.reps,
		schemaVersion: MULTIPLE_GROUPS_REPORT_SCHEMA_VERSION,
	};

	if ("samplingUnit" in quality) {
		return comparisonReportSchema.parse({
			...common,
			samplingUnit: quality.samplingUnit,
		});
	}

	return comparisonReportSchema.parse(common);
}

export { buildComparisonReport as default };
