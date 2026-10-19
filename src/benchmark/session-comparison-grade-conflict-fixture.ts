import type { Immutable } from "./contracts";
import type { SessionComparisonReport } from "./session-comparison-report-reader-fixture";

type SessionReportCase = Immutable<SessionComparisonReport>["cases"][number];

type SessionReportArm = SessionReportCase["arms"]["baseline"];

type SessionReportRep = SessionReportArm["source"]["reps"][number];

interface GradeConflict {
	readonly grade: "B" | "F";
	readonly gradeDistribution: Readonly<Record<string, number>>;
}

interface ConflictingReport extends GradeConflict {
	readonly report: Immutable<SessionComparisonReport>;
}

const INITIAL_REPORT_CASE_INDEX = 0;

const INITIAL_REPORT_REP_INDEX = 0;

function withConflictingRep(
	rep: SessionReportRep,
	{ grade }: GradeConflict,
): SessionReportRep {
	return {
		...rep,
		outcomes: rep.outcomes.map((outcome) => {
			if (outcome.status !== "JUDGED") {
				throw new Error(
					"a conflicting grade fixture requires a judged outcome",
				);
			}

			return { ...outcome, grade, successful: true };
		}),
	};
}

function withConflictingBaseline(
	arm: SessionReportArm,
	conflict: GradeConflict,
): SessionReportArm {
	return {
		...arm,
		quality: arm.quality.map((summary) => ({
			...summary,
			gradeDistribution: conflict.gradeDistribution,
		})),
		source: {
			...arm.source,
			reps: arm.source.reps.map((rep, index) =>
				index === INITIAL_REPORT_REP_INDEX
					? withConflictingRep(rep, conflict)
					: rep,
			),
		},
	};
}

function withConflictingCase(
	benchmarkCase: SessionReportCase,
	conflict: GradeConflict,
): SessionReportCase {
	return {
		...benchmarkCase,
		arms: {
			...benchmarkCase.arms,
			baseline: withConflictingBaseline(benchmarkCase.arms.baseline, conflict),
		},
	};
}

function withConflictingSessionGrade({
	report,
	...conflict
}: ConflictingReport): Immutable<SessionComparisonReport> {
	return {
		...report,
		cases: report.cases.map((benchmarkCase, index) =>
			index === INITIAL_REPORT_CASE_INDEX
				? withConflictingCase(benchmarkCase, conflict)
				: benchmarkCase,
		),
	};
}

export { withConflictingSessionGrade as default };
