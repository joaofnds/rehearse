import type { ComparisonReport } from "./comparison-record";
import type {
	QualitySummary,
	ReportArm,
	ReportCase,
	SourceRep,
	SuccessfulOutcome,
} from "./comparison-report-integrity-test-examples";
import { INITIAL_BASELINE_REP_INDEX } from "./comparison-report-integrity-test-examples";

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
	{ name, grade, gradeDistribution }: SuccessfulOutcome,
): MalformedReportArm {
	return {
		...arm,
		quality: Array.from(arm.quality, (summary) =>
			summary.name === name ? { ...summary, gradeDistribution } : summary,
		),
		source: {
			...arm.source,
			reps: arm.source.reps.map((rep, repIndex) => ({
				...rep,
				outcomes: Array.from(rep.outcomes, (outcome) =>
					repIndex === INITIAL_BASELINE_REP_INDEX && outcome.name === name
						? { ...outcome, grade, successful: true }
						: outcome,
				),
			})),
		},
	};
}

export {
	changeFirstBaseline,
	changeFirstOutcome,
	changeFirstRep,
	changeFirstSummary,
	changeSecondRep,
	markFirstOutcomeSuccessful,
};
