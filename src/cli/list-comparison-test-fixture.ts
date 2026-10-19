import {
	armResourcesWithoutElapsed,
	contrastResourcesWithoutElapsed,
	singleGroupSource,
} from "#benchmark/comparison-legacy-report-test-fixtures";
import type {
	LegacyComparisonReport,
	MultiCaseComparisonReport,
} from "#benchmark/comparison-record";
import { unhandled } from "#benchmark/contracts";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

import {
	elapsedComparisonReport,
	legacyContrasts,
	parseLegacyCandidate,
	resourceComparisonReport,
} from "./legacy-comparison-resources-fixture";

const QUALITY_SUMMARY_COUNT = 1;

const PREFIX_START_INDEX = 0;

const JUDGE_AGREEMENT_COMPARISON_REPORT_VERSION = 2;

const SESSION_COMPARISON_REPORT_VERSION = 3;

const MULTIPLE_GROUP_COMPARISON_REPORT_VERSION = 6;

const LEGACY_COMPARISON_REPORT_VERSION = 1;

const RESOURCE_SUMMARY_COMPARISON_REPORT_VERSION = 4;

const ELAPSED_RESOURCE_COMPARISON_REPORT_VERSION = 5;

const sessionArm = (arm: LegacyPipelineArm): LegacySessionArm => ({
	...arm,
	quality: Array.from(
		arm.quality.slice(PREFIX_START_INDEX, QUALITY_SUMMARY_COUNT),
		(summary) => ({
			...summary,
			name: "checks",
		}),
	),
	source: {
		...arm.source,
		reps: Array.from(arm.source.reps, (rep) => ({
			...rep,
			attempt: {
				path: `attempts/${rep.repId}.json`,
				sha256: "a".repeat(SHA256_HEX_DIGITS),
			},
		})),
	},
});

const sessionContrast = (
	contrast: MultiCaseComparisonReport["contrasts"]["candidateMinusBaseline"],
): VersionThreeReport["contrasts"]["candidateMinusBaseline"] => ({
	...contrast,
	quality: Array.from(
		contrast.quality.slice(PREFIX_START_INDEX, QUALITY_SUMMARY_COUNT),
		(summary) => ({
			...summary,
			name: "checks",
		}),
	),
	resources: contrastResourcesWithoutElapsed(contrast.resources),
});

type VersionTwoReport = Extract<
	LegacyComparisonReport,
	{ readonly schemaVersion: typeof JUDGE_AGREEMENT_COMPARISON_REPORT_VERSION }
>;

type LegacyPipelineArm = VersionTwoReport["cases"][number]["arms"]["baseline"];

type VersionThreeReport = Extract<
	LegacyComparisonReport,
	{ readonly schemaVersion: typeof SESSION_COMPARISON_REPORT_VERSION }
>;

type LegacySessionArm = VersionThreeReport["cases"][number]["arms"]["baseline"];

function withoutOutcomeArm(
	arm: MultiCaseComparisonReport["cases"][number]["arms"]["baseline"],
): LegacyPipelineArm {
	return {
		...arm,
		resources: armResourcesWithoutElapsed(arm.resources),
		source: {
			group: singleGroupSource(arm.source).group,
			reps: singleGroupSource(arm.source).reps.map((rep) => {
				const { outcomes: _outcomes, ...legacyRep } = rep;

				return legacyRep;
			}),
		},
	};
}

function withoutOutcomes(
	report: MultiCaseComparisonReport,
): VersionTwoReport["cases"] {
	return report.cases.map(({ caseId, arms }) => ({
		arms: {
			baseline: withoutOutcomeArm(arms.baseline),
			candidate: withoutOutcomeArm(arms.candidate),
			control: withoutOutcomeArm(arms.control),
		},
		caseId,
	}));
}
function sessionComparisonReport(
	report: MultiCaseComparisonReport,
): LegacyComparisonReport {
	const cases = withoutOutcomes(report);
	const sessionCases: VersionThreeReport["cases"] = cases.map(
		({ caseId, arms }) => ({
			arms: {
				baseline: sessionArm(arms.baseline),
				candidate: sessionArm(arms.candidate),
				control: sessionArm(arms.control),
			},
			caseId,
		}),
	);

	return parseLegacyCandidate(
		JSON.stringify({
			...report,
			cases: sessionCases,
			contrasts: {
				baselineMinusControl: sessionContrast(
					report.contrasts.baselineMinusControl,
				),
				candidateMinusBaseline: sessionContrast(
					report.contrasts.candidateMinusBaseline,
				),
				candidateMinusControl: sessionContrast(
					report.contrasts.candidateMinusControl,
				),
			},
			declaredStages: ["checks"],
			judgeAgreement: { baselines: [], skippedCalibrations: 0 },
			mode: "session",
			schemaVersion: 3,
		}),
	);
}

const legacyComparisonVersions = [
	LEGACY_COMPARISON_REPORT_VERSION,
	JUDGE_AGREEMENT_COMPARISON_REPORT_VERSION,
	SESSION_COMPARISON_REPORT_VERSION,
	RESOURCE_SUMMARY_COMPARISON_REPORT_VERSION,
	ELAPSED_RESOURCE_COMPARISON_REPORT_VERSION,
] as const;

type LegacyComparisonVersion = (typeof legacyComparisonVersions)[number];

function legacyComparisonReport(
	report: MultiCaseComparisonReport,
	version:
		| typeof LEGACY_COMPARISON_REPORT_VERSION
		| typeof JUDGE_AGREEMENT_COMPARISON_REPORT_VERSION
		| typeof SESSION_COMPARISON_REPORT_VERSION
		| typeof RESOURCE_SUMMARY_COMPARISON_REPORT_VERSION
		| typeof ELAPSED_RESOURCE_COMPARISON_REPORT_VERSION,
): LegacyComparisonReport {
	switch (version) {
		case ELAPSED_RESOURCE_COMPARISON_REPORT_VERSION: {
			return elapsedComparisonReport(report);
		}
		case RESOURCE_SUMMARY_COMPARISON_REPORT_VERSION: {
			return resourceComparisonReport(report);
		}
		case LEGACY_COMPARISON_REPORT_VERSION: {
			const { judgeAgreement: _judgeAgreement, ...fields } = report;
			return parseLegacyCandidate(
				JSON.stringify({
					...fields,
					cases: withoutOutcomes(report),
					contrasts: legacyContrasts(report),
					schemaVersion: LEGACY_COMPARISON_REPORT_VERSION,
				}),
			);
		}
		case JUDGE_AGREEMENT_COMPARISON_REPORT_VERSION: {
			return parseLegacyCandidate(
				JSON.stringify({
					...report,
					cases: withoutOutcomes(report),
					contrasts: legacyContrasts(report),
					schemaVersion: JUDGE_AGREEMENT_COMPARISON_REPORT_VERSION,
				}),
			);
		}
		case SESSION_COMPARISON_REPORT_VERSION: {
			return sessionComparisonReport(report);
		}
		default: {
			return unhandled(version, "legacy comparison report version");
		}
	}
}
export {
	legacyComparisonReport,
	legacyComparisonVersions,
	MULTIPLE_GROUP_COMPARISON_REPORT_VERSION,
	PREFIX_START_INDEX,
};

export type { LegacyComparisonVersion };
