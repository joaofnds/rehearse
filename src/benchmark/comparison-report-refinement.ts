import type { z } from "zod";

import type {
	CurrentComparisonReport,
	CurrentJudgedRepOutcome,
	CurrentReportArm,
} from "./comparison-report-current-schema";
import type { ReliabilitySummary } from "./confirmation-report";
import { summarizeReliabilityOutcomes } from "./confirmation-report";
import { stageLetterGradeSchema } from "./contracts";

const ORDINAL_BASE = 1;

const PREVIOUS_ELEMENT_OFFSET = 1;

const FIRST_SOURCE_GROUP_INDEX = 0;

interface ReportRefinementContext {
	readonly addIssue: z.RefinementCtx["addIssue"];
}

interface ArmRefinement {
	readonly path: readonly PropertyKey[];
	readonly context: ReportRefinementContext;
}

interface QualityFieldRefinement extends ArmRefinement {
	readonly summary: CurrentReportArm["quality"][number];
	readonly expected: ReliabilitySummary;
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

function validateRepIdentities(
	report: CurrentComparisonReport,
	arm: CurrentReportArm,
	{ path, context }: ArmRefinement,
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
}

function validateRepOrdinals(
	arm: CurrentReportArm,
	{ path, context }: ArmRefinement,
): void {
	const ordinals = arm.source.reps.map(({ ordinal }) => ordinal);
	const expectedOrdinals = Array.from(
		{ length: arm.source.reps.length },
		(_value, index) => index + ORDINAL_BASE,
	);
	if (!sameStrings(ordinals.map(String), expectedOrdinals.map(String))) {
		addReportIssue(
			context,
			[...path, "source", "reps"],
			"rep ordinals must cover report reps in order",
		);
	}
}

function validateRepGroups(
	arm: CurrentReportArm,
	{ path, context }: ArmRefinement,
): void {
	const groups = arm.source.reps.map(({ group }) => group);
	const namedGroups = Array.from(
		{ length: arm.source.groups.length },
		(_value, index) => index,
	);
	if (
		!sameStrings([...new Set(groups)].map(String), namedGroups.map(String)) ||
		groups.some(
			(group, index) =>
				group <
				(groups[index - PREVIOUS_ELEMENT_OFFSET] ?? FIRST_SOURCE_GROUP_INDEX),
		)
	) {
		addReportIssue(
			context,
			[...path, "source", "reps"],
			"reps must come from every named group, in order",
		);
	}
}

function validateQualityNames(
	report: CurrentComparisonReport,
	arm: CurrentReportArm,
	{ path, context }: ArmRefinement,
): void {
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
}

function validateRepGrades(
	report: CurrentComparisonReport,
	rep: CurrentReportArm["source"]["reps"][number],
	{ path, context }: ArmRefinement,
): void {
	for (const [outcomeIndex, outcome] of rep.outcomes.entries()) {
		if (
			outcome.status === "JUDGED" &&
			!judgedOutcomeMatchesMode(report, outcome)
		) {
			addReportIssue(
				context,
				[...path, "outcomes", outcomeIndex, "grade"],
				"judged grade and success must match the comparison mode and measure",
			);
		}
	}
}

function validateRepOutcomes(
	report: CurrentComparisonReport,
	arm: CurrentReportArm,
	{ path, context }: ArmRefinement,
): void {
	const names = expectedOutcomeNames(report);
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

		validateRepGrades(report, rep, {
			context,
			path: [...path, "source", "reps", repIndex],
		});
	}
}

function validateQualityFields({
	context,
	expected,
	path,
	summary,
}: QualityFieldRefinement): void {
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
				[...path, key],
				`${key} must match per-rep outcomes`,
			);
		}
	}

	if (
		!sameDistribution(summary.gradeDistribution, expected.gradeDistribution)
	) {
		addReportIssue(
			context,
			[...path, "gradeDistribution"],
			"grade distribution must match per-rep outcomes",
		);
	}
}

function validateQualitySummaries(
	arm: CurrentReportArm,
	{ path, context }: ArmRefinement,
): void {
	for (const [qualityIndex, summary] of arm.quality.entries()) {
		const outcomes = arm.source.reps
			.map((rep) => rep.outcomes[qualityIndex])
			.filter((outcome) => outcome !== undefined);
		const expected = summarizeReliabilityOutcomes(summary.name, outcomes);
		const summaryPath = [...path, "quality", qualityIndex];

		validateQualityFields({ context, expected, path: summaryPath, summary });
	}
}

function validateArm(
	report: CurrentComparisonReport,
	arm: CurrentReportArm,
	refinement: ArmRefinement,
): void {
	validateRepIdentities(report, arm, refinement);
	validateRepOrdinals(arm, refinement);
	validateRepGroups(arm, refinement);
	validateQualityNames(report, arm, refinement);
	validateRepOutcomes(report, arm, refinement);
	validateQualitySummaries(arm, refinement);
}

export { validateArm as default };
