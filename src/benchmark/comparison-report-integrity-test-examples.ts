import type { ComparisonReport } from "./comparison-record";
import type { RepFixtureOutcomes } from "./comparison-test-fixtures";

interface PipelineFinalExample {
	readonly final: RepFixtureOutcomes["final"];
	readonly status: Exclude<SourceRep["outcomes"][number]["status"], "JUDGED">;
}

interface JudgedOutcomeExample extends SuccessfulOutcome {
	readonly domain: string;
}

const INITIAL_BASELINE_REP_INDEX = 0;

const SUCCESSFUL_REP_COUNT = 2;

const REQUESTED_REP_COUNT = 3;

const TOTAL_PROBABILITY = 1;

const COUNT_MISMATCH_INCREMENT = 1;

const RATE_MISMATCH_INCREMENT = 0.01;

const OMITTED_INITIAL_CASE_COUNT = 1;

const OMITTED_FINAL_REP_OFFSET = -1;

const FIRST_QUALITY_SUMMARY_INDEX = 0;

const FIRST_REP_OUTCOME_INDEX = 0;

const SECOND_CONFIRMATION_REP_INDEX = 1;

const THIRD_CONFIRMATION_REP_INDEX = 2;

const FOURTH_CONFIRMATION_REP_INDEX = 3;

const THIRD_REP_OUTCOME_INDEX = 2;

const FIRST_SOURCE_REP_INDEX = 0;

const FIRST_REPORTED_CASE_INDEX = 0;

const FIRST_COMPARISON_CASE_INDEX = 0;

const FIRST_CONFIRMATION_REP_INDEX = 0;

const PREFIX_START_INDEX = 0;

const SHA256_HEX_CHARACTERS = 64;

type ReportArm = ComparisonReport["cases"][number]["arms"]["baseline"];

type SourceRep = ReportArm["source"]["reps"][number];

type QualitySummary = ReportArm["quality"][number];

type ReportCase = ComparisonReport["cases"][number];

interface SuccessfulOutcome {
	readonly name: string;
	readonly grade: string;
	readonly gradeDistribution: Readonly<Record<string, number>>;
}

const PIPELINE_FINAL_EXAMPLES: readonly PipelineFinalExample[] = [
	{ final: "error", status: "EXECUTION_FAILED" },
	{ final: "metrics-missing", status: "METRICS_MISSING" },
];

const OUTSIDE_DOMAIN_EXAMPLES: readonly JudgedOutcomeExample[] = [
	{
		domain: "stage",
		grade: "PASS",
		gradeDistribution: Object.fromEntries(
			[
				{ count: 1, grade: "A" },
				{ count: 2, grade: "D" },
				{ count: 1, grade: "PASS" },
			].map(({ grade, count }) => [grade, count]),
		),
		name: "discuss",
	},
	{
		domain: "pipeline final",
		grade: "A",
		gradeDistribution: Object.fromEntries(
			[
				{ count: 1, grade: "PASS" },
				{ count: 2, grade: "FAIL" },
				{ count: 1, grade: "A" },
			].map(({ grade, count }) => [grade, count]),
		),
		name: "final",
	},
];

const UNSUCCESSFUL_JUDGE_EXAMPLES: readonly JudgedOutcomeExample[] = [
	{
		domain: "stage",
		grade: "D",
		gradeDistribution: Object.fromEntries(
			[
				{ count: 1, grade: "A" },
				{ count: 3, grade: "D" },
			].map(({ grade, count }) => [grade, count]),
		),
		name: "discuss",
	},
	{
		domain: "pipeline final",
		grade: "FAIL",
		gradeDistribution: { FAIL: 3, PASS: 1 },
		name: "final",
	},
];

const REPORTED_COUNT_FIELDS = [
	"requested",
	"attempted",
	"notReached",
	"failed",
	"successful",
] as const;

const REPORTED_ESTIMATE_FIELDS = [
	"successRate",
	"standardError",
	"passK",
] as const;
export {
	COUNT_MISMATCH_INCREMENT,
	FIRST_COMPARISON_CASE_INDEX,
	FIRST_CONFIRMATION_REP_INDEX,
	FIRST_QUALITY_SUMMARY_INDEX,
	FIRST_REP_OUTCOME_INDEX,
	FIRST_REPORTED_CASE_INDEX,
	FIRST_SOURCE_REP_INDEX,
	FOURTH_CONFIRMATION_REP_INDEX,
	INITIAL_BASELINE_REP_INDEX,
	OMITTED_FINAL_REP_OFFSET,
	OMITTED_INITIAL_CASE_COUNT,
	OUTSIDE_DOMAIN_EXAMPLES,
	PIPELINE_FINAL_EXAMPLES,
	PREFIX_START_INDEX,
	RATE_MISMATCH_INCREMENT,
	REPORTED_COUNT_FIELDS,
	REPORTED_ESTIMATE_FIELDS,
	REQUESTED_REP_COUNT,
	SECOND_CONFIRMATION_REP_INDEX,
	SHA256_HEX_CHARACTERS,
	SUCCESSFUL_REP_COUNT,
	THIRD_CONFIRMATION_REP_INDEX,
	THIRD_REP_OUTCOME_INDEX,
	TOTAL_PROBABILITY,
	UNSUCCESSFUL_JUDGE_EXAMPLES,
};
export type {
	JudgedOutcomeExample,
	PipelineFinalExample,
	QualitySummary,
	ReportArm,
	ReportCase,
	SourceRep,
	SuccessfulOutcome,
};
