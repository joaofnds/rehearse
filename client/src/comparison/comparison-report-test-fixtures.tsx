import type { ComparisonReport } from "#benchmark/comparison-record";
import type { MoreAttemptsCost } from "#benchmark/more-attempts-cost";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import type { ArmFigures } from "#server/comparison-arm-figures";
import type { CaseAttempts } from "#server/comparison-attempts";
import type { CaseSummary } from "#server/comparison-summary";

type ReportArm = ComparisonReport["cases"][number]["arms"]["baseline"];

const CANDIDATE_CLEARS = Object.fromEntries(
	[
		{ count: 3, grade: "A" },
		{ count: 1, grade: "D" },
	].map(({ grade, count }) => [grade, count]),
);

const BASELINE_LAGS = Object.fromEntries(
	[
		{ count: 1, grade: "A" },
		{ count: 3, grade: "D" },
	].map(({ grade, count }) => [grade, count]),
);

function arm(
	role: ReportArm["role"],
	hash: string,
	gradeDistribution: Readonly<Record<string, number>>,
): ReportArm {
	return {
		executedCorpus: [
			{ path: "CLAUDE.md", sha256: hash.repeat(SHA256_HEX_CHARACTERS) },
		],
		quality: [
			{
				attempted: 4,
				failed: 0,
				gradeDistribution,
				name: "final",
				notReached: 0,
				passK: 1,
				requested: 4,
				standardError: 0,
				successRate: 1,
				successful: 4,
			},
		],
		resources: {
			completeReps: 0,
			missingEvidence: [{ missing: ["worker"], ordinal: 1, repId: "rep-1" }],
			missingMetricReps: 1,
			status: "UNAVAILABLE",
		},
		role,
		source: armSourceRecord(),
	};
}

const PASSED_EVERY_ATTEMPT: ArmFigures = {
	cost: { perAttemptUsd: 0.5, state: "available", totalUsd: 2 },
	measures: { final: { attempts: 4, scale: "successRate", successful: 4 } },
	words: { reasons: ["no words recorded"], state: "unavailable" },
};

const PASSED: CaseAttempts["baseline"][number] = {
	blockersFired: { reason: "no blocker grading", state: "unavailable" },
	ordinal: 1,
	outcomes: {
		outcomes: [
			{ grade: "PASS", name: "final", status: "JUDGED", successful: true },
		],
		state: "available",
	},
	repId: "rep-1",
	words: { reason: "no word count", state: "unavailable" },
};

const ONE_ATTEMPT_EACH: CaseAttempts = {
	baseline: [PASSED],
	candidate: [PASSED],
	control: [PASSED],
};

const ONE_EQUAL_COMBINATION: CaseSummary["contrasts"][string][string] = {
	combinations: { equal: 1, higher: 0, lower: 0, of: 1, state: "available" },
	verdict: { kind: "insideRerunNoise" },
};

function armSourceRecord(): ReportArm["source"] {
	return {
		groups: [{ path: "group.json", sha256: "0".repeat(SHA256_HEX_CHARACTERS) }],
		reps: [
			{
				group: 0,
				ordinal: 1,
				outcomes: [
					{
						grade: "PASS",
						name: "final",
						status: "JUDGED",
						successful: true,
					},
				],
				path: "rep.json",
				repId: "rep-1",
				sha256: "0".repeat(SHA256_HEX_CHARACTERS),
			},
		],
	};
}

function caseSummary(moreAttempts: MoreAttemptsCost): CaseSummary {
	return {
		contrasts: {
			candidateMinusBaseline: { checks: ONE_EQUAL_COMBINATION },
		},
		moreAttempts,
		replyLength: {
			change: undefined,
			interval: { minuend: undefined, subtrahend: undefined },
			verdict: { kind: "unavailable", reasons: ["no word count"] },
		},
	};
}

export {
	arm,
	BASELINE_LAGS,
	CANDIDATE_CLEARS,
	caseSummary,
	ONE_ATTEMPT_EACH,
	ONE_EQUAL_COMBINATION,
	PASSED,
	PASSED_EVERY_ATTEMPT,
};
