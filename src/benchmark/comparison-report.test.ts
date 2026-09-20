import { describe, expect, it } from "bun:test";
import { buildComparisonReport } from "./comparison-report";
import {
	parseComparisonReport,
	serializeComparisonReport,
} from "./comparison-record";
import type { ComparisonReport } from "./comparison-record";
import {
	armResourcesWithoutElapsed,
	comparisonEvidenceFixture,
	comparisonReps,
	contrastResourcesWithoutElapsed,
	FAIL,
	PASS,
	withMissingMetrics,
} from "./comparison-test-fixtures";

type ReportArm = ComparisonReport["cases"][number]["arms"]["baseline"];
type SourceRep = ReportArm["source"]["reps"][number];
type QualitySummary = ReportArm["quality"][number];

interface MalformedRepOutcome {
	readonly name: string;
	readonly status: string;
	readonly grade?: string | undefined;
	readonly successful: boolean;
}

type MalformedSourceRep = Omit<SourceRep, "repId" | "ordinal" | "outcomes"> & {
	readonly repId?: string | undefined;
	readonly ordinal?: number | undefined;
	readonly outcomes: readonly MalformedRepOutcome[];
};
type MalformedReportArm = Omit<ReportArm, "source"> & {
	readonly source: Omit<ReportArm["source"], "reps"> & {
		readonly reps: readonly MalformedSourceRep[];
	};
};
type ReportCase = ComparisonReport["cases"][number];
type MalformedReportCase = Omit<ReportCase, "arms"> & {
	readonly arms: Omit<ReportCase["arms"], "baseline"> & {
		readonly baseline: MalformedReportArm;
	};
};
type MalformedComparisonReport = Omit<ComparisonReport, "cases"> & {
	readonly cases: readonly MalformedReportCase[];
};

function changeFirstBaseline(
	report: ComparisonReport,
	change: (arm: ReportArm) => MalformedReportArm,
): MalformedComparisonReport {
	const [firstCase, ...remainingCases] = report.cases;
	if (firstCase === undefined) {
		throw new Error("comparison report has no first case");
	}

	return {
		...report,
		cases: [
			{
				...firstCase,
				arms: {
					...firstCase.arms,
					baseline: change(firstCase.arms.baseline),
				},
			},
			...remainingCases,
		],
	};
}

function changeFirstRep(
	arm: ReportArm,
	change: (rep: SourceRep) => MalformedSourceRep,
): MalformedReportArm {
	const [firstRep, ...remainingReps] = arm.source.reps;
	if (firstRep === undefined) {
		throw new Error("comparison arm has no first rep");
	}

	return {
		...arm,
		source: {
			...arm.source,
			reps: [change(firstRep), ...remainingReps],
		},
	};
}

function changeSecondRep(
	arm: ReportArm,
	change: (rep: SourceRep) => MalformedSourceRep,
): MalformedReportArm {
	const [firstRep, secondRep, ...remainingReps] = arm.source.reps;
	if (firstRep === undefined || secondRep === undefined) {
		throw new Error("comparison arm has fewer than two reps");
	}

	return {
		...arm,
		source: {
			...arm.source,
			reps: [firstRep, change(secondRep), ...remainingReps],
		},
	};
}

function changeFirstOutcome(
	arm: ReportArm,
	change: (outcome: SourceRep["outcomes"][number]) => MalformedRepOutcome,
): MalformedReportArm {
	return changeFirstRep(arm, (rep) => {
		const [firstOutcome, ...remainingOutcomes] = rep.outcomes;
		if (firstOutcome === undefined) {
			throw new Error("comparison rep has no first outcome");
		}

		return {
			...rep,
			outcomes: [change(firstOutcome), ...remainingOutcomes],
		};
	});
}

function changeFirstSummary(
	arm: ReportArm,
	change: (summary: QualitySummary) => QualitySummary,
): MalformedReportArm {
	const [firstSummary, ...remainingSummaries] = arm.quality;
	if (firstSummary === undefined) {
		throw new Error("comparison arm has no first quality summary");
	}

	return {
		...arm,
		quality: [change(firstSummary), ...remainingSummaries],
	};
}

function markFirstOutcomeSuccessful(
	arm: ReportArm,
	name: string,
	grade: string,
	gradeDistribution: Readonly<Record<string, number>>,
): MalformedReportArm {
	return {
		...arm,
		source: {
			...arm.source,
			reps: Array.from(arm.source.reps, (rep, repIndex) => ({
				...rep,
				outcomes: Array.from(rep.outcomes, (outcome) =>
					repIndex === 0 && outcome.name === name
						? { ...outcome, grade, successful: true }
						: outcome,
				),
			})),
		},
		quality: Array.from(arm.quality, (summary) =>
			summary.name === name ? { ...summary, gradeDistribution } : summary,
		),
	};
}

function currentComparisonReport(): ComparisonReport {
	return buildComparisonReport(comparisonEvidenceFixture(), {
		skippedCalibrations: 0,
		baselines: [],
	});
}

function expectReportRejected(candidate: MalformedComparisonReport): void {
	expect(() => parseComparisonReport(JSON.stringify(candidate))).toThrow();
}

describe(buildComparisonReport.name, () => {
	it("keeps each repetition's outcomes when aggregate distributions match", () => {
		const fixture = comparisonEvidenceFixture();
		const candidateRecords = comparisonReps("case-1", "candidate", [
			FAIL,
			FAIL,
			PASS,
			PASS,
		]);
		const [firstCase] = fixture.cases;
		if (firstCase === undefined) {
			throw new Error("fixture has no first case");
		}
		const evidence = {
			...fixture,
			cases: [
				{
					...firstCase,
					arms: {
						...firstCase.arms,
						candidate: {
							...firstCase.arms.candidate,
							reps: Array.from(firstCase.arms.candidate.reps, (rep, index) => ({
								...rep,
								record: candidateRecords[index] ?? rep.record,
							})),
						},
					},
				},
				...fixture.cases.slice(1),
			],
		};

		const report = buildComparisonReport(evidence, {
			skippedCalibrations: 0,
			baselines: [],
		});
		const [benchmarkCase] = report.cases;

		expect(report.schemaVersion).toBe(5);
		expect(benchmarkCase?.arms.baseline.quality[0]?.gradeDistribution).toEqual(
			Object.fromEntries([
				["A", 2],
				["D", 2],
			]),
		);
		expect(benchmarkCase?.arms.candidate.quality[0]?.gradeDistribution).toEqual(
			Object.fromEntries([
				["A", 2],
				["D", 2],
			]),
		);
		expect(
			benchmarkCase?.arms.baseline.source.reps.map(({ ordinal, outcomes }) => ({
				ordinal,
				outcome: outcomes[0],
			})),
		).toEqual([
			{
				ordinal: 1,
				outcome: {
					name: "discuss",
					status: "JUDGED",
					grade: "A",
					successful: true,
				},
			},
			{
				ordinal: 2,
				outcome: {
					name: "discuss",
					status: "JUDGED",
					grade: "A",
					successful: true,
				},
			},
			{
				ordinal: 3,
				outcome: {
					name: "discuss",
					status: "JUDGED",
					grade: "D",
					successful: false,
				},
			},
			{
				ordinal: 4,
				outcome: {
					name: "discuss",
					status: "JUDGED",
					grade: "D",
					successful: false,
				},
			},
		]);
		expect(
			benchmarkCase?.arms.candidate.source.reps.map(
				({ ordinal, outcomes }) => ({
					ordinal,
					outcome: outcomes[0],
				}),
			),
		).toEqual([
			{
				ordinal: 1,
				outcome: {
					name: "discuss",
					status: "JUDGED",
					grade: "D",
					successful: false,
				},
			},
			{
				ordinal: 2,
				outcome: {
					name: "discuss",
					status: "JUDGED",
					grade: "D",
					successful: false,
				},
			},
			{
				ordinal: 3,
				outcome: {
					name: "discuss",
					status: "JUDGED",
					grade: "A",
					successful: true,
				},
			},
			{
				ordinal: 4,
				outcome: {
					name: "discuss",
					status: "JUDGED",
					grade: "A",
					successful: true,
				},
			},
		]);
	});

	it("records strict versioned results and all frozen source provenance", () => {
		const judgeAgreement = {
			skippedCalibrations: 1,
			baselines: [
				{
					judgeModel: "opus",
					stage: "final",
					rubricSha256: "9".repeat(64),
					criteria: [
						{
							rubricId: "correctness",
							sampleSize: 1,
							judgePassHumanPass: 1,
							judgeFailHumanFail: 0,
							judgePassHumanFail: 0,
							judgeFailHumanPass: 0,
							observedAgreement: 1,
							cohensKappa: null,
						},
					],
				},
			],
		};

		const report = buildComparisonReport(
			comparisonEvidenceFixture(),
			judgeAgreement,
		);
		const candidate = report.cases.at(0)?.arms.candidate;

		expect(parseComparisonReport(JSON.stringify(report))).toEqual(report);
		expect(serializeComparisonReport(report)).toBe(
			`${JSON.stringify(report, null, 2)}\n`,
		);
		expect(report.schemaVersion).toBe(5);
		expect(report.judgeAgreement).toEqual(judgeAgreement);
		expect(report.manifest).toEqual({ sha256: "8".repeat(64) });
		expect(report.mode).toBe("pipeline");
		expect(report.declaredStages).toEqual(["discuss", "build"]);
		expect(report.reps).toBe(4);
		expect(candidate?.role).toBe("candidate");
		expect(candidate?.source.group).toEqual({
			path: "groups/case-1-candidate/group.json",
			sha256: "6".repeat(64),
		});
		expect(candidate?.source.reps.at(0)).toEqual({
			repId: "case-1-candidate-rep-1",
			ordinal: 1,
			path: "groups/case-1-candidate/reps/case-1-candidate-rep-1/rep.json",
			sha256: "7".repeat(64),
			outcomes: [
				{
					name: "discuss",
					status: "JUDGED",
					grade: "A",
					successful: true,
				},
				{
					name: "build",
					status: "JUDGED",
					grade: "A",
					successful: true,
				},
				{
					name: "final",
					status: "JUDGED",
					grade: "PASS",
					successful: true,
				},
			],
		});
		expect(candidate?.executedCorpus).toEqual([
			{
				path: "inputs/corpus/SKILL.md",
				sha256: "2".repeat(64),
			},
		]);
		expect(report.contrasts.candidateMinusBaseline.minuend).toBe("candidate");
		expect(report.contrasts.candidateMinusBaseline.subtrahend).toBe("baseline");
		expect(() =>
			parseComparisonReport(
				JSON.stringify({ ...report, unexpected: "not strict" }),
			),
		).toThrow();
	});

	it("preserves non-judged outcomes and metrics-aware judged success", () => {
		const fixture = comparisonEvidenceFixture();
		const [firstCase] = fixture.cases;
		if (firstCase === undefined) {
			throw new Error("fixture has no first case");
		}
		const baseline = comparisonReps("case-1", "baseline", [
			PASS,
			{
				discussion: "error",
				build: "not-reached",
				final: "not-reached",
			},
			{
				discussion: "pass",
				build: "metrics-missing",
				final: "not-reached",
			},
			PASS,
		]);
		const lastRep = baseline.at(3);
		if (lastRep === undefined) {
			throw new Error("fixture has no fourth baseline rep");
		}
		const evidence = {
			...fixture,
			cases: [
				{
					...firstCase,
					arms: {
						...firstCase.arms,
						baseline: {
							...firstCase.arms.baseline,
							reps: Array.from(firstCase.arms.baseline.reps, (rep, index) => ({
								...rep,
								record:
									index === 3
										? withMissingMetrics(lastRep, "final judge metrics")
										: (baseline[index] ?? rep.record),
							})),
						},
					},
				},
				...fixture.cases.slice(1),
			],
		};

		const report = buildComparisonReport(evidence, {
			skippedCalibrations: 0,
			baselines: [],
		});
		const [reportedCase] = report.cases;
		const reps = reportedCase?.arms.baseline.source.reps;

		expect(reps?.[1]?.outcomes).toEqual([
			{
				name: "discuss",
				status: "EXECUTION_FAILED",
				successful: false,
			},
			{ name: "build", status: "NOT_REACHED", successful: false },
			{ name: "final", status: "NOT_REACHED", successful: false },
		]);
		expect(reps?.[2]?.outcomes).toEqual([
			{ name: "discuss", status: "JUDGED", grade: "A", successful: true },
			{ name: "build", status: "METRICS_MISSING", successful: false },
			{ name: "final", status: "NOT_REACHED", successful: false },
		]);
		expect(reps?.[3]?.outcomes).toEqual([
			{ name: "discuss", status: "JUDGED", grade: "A", successful: false },
			{ name: "build", status: "JUDGED", grade: "A", successful: false },
			{ name: "final", status: "JUDGED", grade: "PASS", successful: false },
		]);
	});

	it.each([
		["error", "EXECUTION_FAILED"],
		["metrics-missing", "METRICS_MISSING"],
	] as const)("preserves a pipeline-final %s outcome", (final, status) => {
		const fixture = comparisonEvidenceFixture();
		const [firstCase] = fixture.cases;
		if (firstCase === undefined) {
			throw new Error("fixture has no first case");
		}
		const [replacement] = comparisonReps("case-1", "baseline", [
			{ discussion: "pass", build: "pass", final },
		]);
		if (replacement === undefined) {
			throw new Error("fixture has no replacement rep");
		}
		const evidence = {
			...fixture,
			cases: [
				{
					...firstCase,
					arms: {
						...firstCase.arms,
						baseline: {
							...firstCase.arms.baseline,
							reps: Array.from(firstCase.arms.baseline.reps, (rep, index) =>
								index === 0 ? { ...rep, record: replacement } : rep,
							),
						},
					},
				},
				...fixture.cases.slice(1),
			],
		};

		const report = buildComparisonReport(evidence, {
			skippedCalibrations: 0,
			baselines: [],
		});
		const outcome = report.cases[0]?.arms.baseline.source.reps[0]?.outcomes[2];

		expect(outcome).toEqual({ name: "final", status, successful: false });
		expect(outcome).not.toHaveProperty("grade");
	});

	it("parses persisted version-one and version-two reports strictly", () => {
		const current = buildComparisonReport(comparisonEvidenceFixture(), {
			skippedCalibrations: 0,
			baselines: [],
		});
		if (current.mode !== "pipeline") {
			throw new Error("expected a stage or pipeline comparison report");
		}
		const withoutOutcomes = (
			rep: (typeof current.cases)[number]["arms"]["baseline"]["source"]["reps"][number],
		): Omit<typeof rep, "outcomes"> => {
			const { outcomes: _outcomes, ...legacyRep } = rep;

			return legacyRep;
		};
		const withoutArmElapsed = (
			arm: (typeof current.cases)[number]["arms"]["baseline"],
		): Omit<typeof arm, "resources" | "source"> & {
			readonly resources: ReturnType<typeof armResourcesWithoutElapsed>;
			readonly source: Omit<typeof arm.source, "reps"> & {
				readonly reps: readonly Omit<
					(typeof arm.source.reps)[number],
					"outcomes"
				>[];
			};
		} => ({
			...arm,
			resources: armResourcesWithoutElapsed(arm.resources),
			source: {
				...arm.source,
				reps: arm.source.reps.map(withoutOutcomes),
			},
		});
		const withoutContrastElapsed = (
			contrast: (typeof current.contrasts)[keyof typeof current.contrasts],
		): Omit<typeof contrast, "resources"> & {
			readonly resources: ReturnType<typeof contrastResourcesWithoutElapsed>;
		} => ({
			...contrast,
			resources: contrastResourcesWithoutElapsed(contrast.resources),
		});
		const cases = current.cases.map(({ caseId, arms }) => ({
			caseId,
			arms: {
				baseline: withoutArmElapsed(arms.baseline),
				candidate: withoutArmElapsed(arms.candidate),
				control: withoutArmElapsed(arms.control),
			},
		}));
		const contrasts = {
			candidateMinusBaseline: withoutContrastElapsed(
				current.contrasts.candidateMinusBaseline,
			),
			candidateMinusControl: withoutContrastElapsed(
				current.contrasts.candidateMinusControl,
			),
			baselineMinusControl: withoutContrastElapsed(
				current.contrasts.baselineMinusControl,
			),
		};
		const versionTwo = {
			...current,
			schemaVersion: 2 as const,
			cases,
			contrasts,
		};

		expect(parseComparisonReport(JSON.stringify(versionTwo))).toEqual(
			versionTwo,
		);

		const { judgeAgreement: _judgeAgreement, ...reportWithoutAgreement } =
			versionTwo;
		const legacy = { ...reportWithoutAgreement, schemaVersion: 1 as const };

		expect(parseComparisonReport(JSON.stringify(legacy))).toEqual(legacy);
		expect(() =>
			parseComparisonReport(
				JSON.stringify({ ...legacy, unexpected: "not strict" }),
			),
		).toThrow();
	});

	it("rejects a source rep count that disagrees with report reps", () => {
		const report = currentComparisonReport();
		const successRate = 2 / 3;
		const candidate = changeFirstBaseline(report, (arm) => ({
			...arm,
			source: { ...arm.source, reps: arm.source.reps.slice(0, -1) },
			quality: Array.from(arm.quality, (summary) => ({
				...summary,
				requested: 3,
				attempted: 3,
				notReached: 0,
				failed: 1,
				successful: 2,
				gradeDistribution:
					summary.name === "final"
						? { PASS: 2, FAIL: 1 }
						: Object.fromEntries([
								["A", 2],
								["D", 1],
							]),
				successRate,
				standardError: Math.sqrt((successRate * (1 - successRate)) / 3),
				passK: successRate ** 3,
			})),
		}));

		expectReportRejected(candidate);
	});

	it("rejects a source rep with no ordinal", () => {
		const report = currentComparisonReport();
		const candidate = changeFirstBaseline(report, (arm) =>
			changeFirstRep(arm, (rep) => {
				const { ordinal: _ordinal, ...withoutOrdinal } = rep;

				return withoutOrdinal;
			}),
		);

		expectReportRejected(candidate);
	});

	it("rejects duplicate source rep ordinals", () => {
		const report = currentComparisonReport();
		const candidate = changeFirstBaseline(report, (arm) =>
			changeSecondRep(arm, (rep) => ({ ...rep, ordinal: 1 })),
		);

		expectReportRejected(candidate);
	});

	it("rejects a source rep with no ID", () => {
		const report = currentComparisonReport();
		const candidate = changeFirstBaseline(report, (arm) =>
			changeFirstRep(arm, (rep) => {
				const { repId: _repId, ...withoutRepId } = rep;

				return withoutRepId;
			}),
		);

		expectReportRejected(candidate);
	});

	it("rejects duplicate source rep IDs", () => {
		const report = currentComparisonReport();
		const candidate = changeFirstBaseline(report, (arm) =>
			changeSecondRep(arm, (rep) => ({
				...rep,
				repId: arm.source.reps[0]?.repId,
			})),
		);

		expectReportRejected(candidate);
	});

	it("rejects outcomes whose order disagrees with report measures", () => {
		const report = currentComparisonReport();
		const candidate = changeFirstBaseline(report, (arm) =>
			changeFirstRep(arm, (rep) => {
				const [firstOutcome, secondOutcome, ...remainingOutcomes] =
					rep.outcomes;
				if (firstOutcome === undefined || secondOutcome === undefined) {
					throw new Error("comparison rep has fewer than two outcomes");
				}

				return {
					...rep,
					outcomes: [secondOutcome, firstOutcome, ...remainingOutcomes],
				};
			}),
		);

		expectReportRejected(candidate);
	});

	it("rejects an outcome name that disagrees with report measures", () => {
		const report = currentComparisonReport();
		const candidate = changeFirstBaseline(report, (arm) =>
			changeFirstOutcome(arm, (outcome) => ({
				...outcome,
				name: "wrong-measure",
			})),
		);

		expectReportRejected(candidate);
	});

	it.each([
		[
			"stage",
			"discuss",
			"PASS",
			Object.fromEntries([
				["A", 1],
				["D", 2],
				["PASS", 1],
			]),
		],
		[
			"pipeline final",
			"final",
			"A",
			Object.fromEntries([
				["PASS", 1],
				["FAIL", 2],
				["A", 1],
			]),
		],
	] as const)(
		"rejects a grade outside the %s domain",
		(_domain, name, grade, distribution) => {
			const report = currentComparisonReport();
			const candidate = changeFirstBaseline(report, (arm) =>
				markFirstOutcomeSuccessful(arm, name, grade, distribution),
			);

			expectReportRejected(candidate);
		},
	);

	it.each([
		[
			"stage",
			"discuss",
			"D",
			Object.fromEntries([
				["A", 1],
				["D", 3],
			]),
		],
		[
			"pipeline final",
			"final",
			"FAIL",
			Object.fromEntries([
				["PASS", 1],
				["FAIL", 3],
			]),
		],
	] as const)(
		"rejects a successful judged %s failure",
		(_measure, name, grade, distribution) => {
			const report = currentComparisonReport();
			const candidate = changeFirstBaseline(report, (arm) =>
				markFirstOutcomeSuccessful(arm, name, grade, distribution),
			);

			expectReportRejected(candidate);
		},
	);

	it("rejects a quality name that disagrees with report measures", () => {
		const report = currentComparisonReport();
		const candidate = changeFirstBaseline(report, (arm) =>
			changeFirstSummary(arm, (summary) => ({
				...summary,
				name: "wrong-measure",
			})),
		);

		expectReportRejected(candidate);
	});

	it.each([
		"requested",
		"attempted",
		"notReached",
		"failed",
		"successful",
	] as const)("rejects a changed %s count", (field) => {
		const report = currentComparisonReport();
		const candidate = changeFirstBaseline(report, (arm) =>
			changeFirstSummary(arm, (summary) => ({
				...summary,
				[field]: summary[field] + 1,
			})),
		);

		expectReportRejected(candidate);
	});

	it.each(["successRate", "standardError", "passK"] as const)(
		"rejects a changed %s estimate",
		(field) => {
			const report = currentComparisonReport();
			const candidate = changeFirstBaseline(report, (arm) =>
				changeFirstSummary(arm, (summary) => ({
					...summary,
					[field]: summary[field] + 0.01,
				})),
			);

			expectReportRejected(candidate);
		},
	);

	it("rejects a changed grade distribution", () => {
		const report = currentComparisonReport();
		const candidate = changeFirstBaseline(report, (arm) =>
			changeFirstSummary(arm, (summary) => ({
				...summary,
				gradeDistribution: Object.fromEntries([["A", 999]]),
			})),
		);

		expectReportRejected(candidate);
	});
});
