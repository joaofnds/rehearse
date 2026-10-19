import type { GroupStageSummary } from "#server/confirmation-group-summary";
import type { ListedStageGrade } from "#server/run-history";

interface StageSummaryFixture {
	readonly stage: string;
	readonly median: "A" | "B" | undefined;
	readonly graded: number;
}

interface GradedStageFixture {
	readonly stage: string;
	readonly letter: string;
}

function gradedStage({ stage, letter }: GradedStageFixture): ListedStageGrade {
	return {
		grade: {
			letter,
			reachesMinimum: true,
			state: "available",
			verdict: "CONTINUE",
		},
		stage,
		status: "graded",
	};
}

interface UngradedStageFixture {
	readonly stage: string;
	readonly status: ListedStageGrade["status"];
}

function ungradedStage({
	stage,
	status,
}: UngradedStageFixture): ListedStageGrade {
	return {
		grade: { reasons: ["no grade recorded"], state: "unavailable" },
		stage,
		status,
	};
}

function groupStageSummary({
	stage,
	median,
	graded,
}: StageSummaryFixture): GroupStageSummary {
	return {
		graded,
		grades:
			median === undefined
				? { reasons: ["no rep was graded at this stage"], state: "unavailable" }
				: { highest: "A", lowest: "C", median, state: "available" },
		stage,
		ungraded: {},
	};
}

interface StageVerdictFixture {
	readonly name: string;
	readonly letter: string;
	readonly reachesMinimum: boolean;
}

function stageWithVerdict({
	name,
	letter,
	reachesMinimum,
}: StageVerdictFixture): ListedStageGrade {
	return {
		grade: {
			letter,
			reachesMinimum,
			state: "available",
			verdict: reachesMinimum ? "CONTINUE" : "STOP",
		},
		stage: name,
		status: reachesMinimum ? "graded" : "stopped",
	};
}

function unreachedStage(name: string): ListedStageGrade {
	return {
		grade: { reasons: ["never reached"], state: "unavailable" },
		stage: name,
		status: "not-run",
	};
}

export {
	gradedStage,
	ungradedStage,
	groupStageSummary,
	stageWithVerdict,
	unreachedStage,
};
