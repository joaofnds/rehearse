import plural from "#client/plural";
import stageCostReading from "#client/run-detail/step-readings";
import {
	notRecorded,
	skillReading,
	wallTimeReading,
} from "#client/run-detail/step-report";
import { Grade } from "#client/system/components/grade";
import { STATUS_VOCABULARY } from "#client/system/components/status";

import type { MonitoredStage, RunRecordResponse } from "./run-record-query";
import { continuationReading, endedStatus, hasEnded } from "./run-record-query";
import type { StageJudgeResponse } from "./stage-judge-query";

const ORDINAL_BASE = 1;

const STEP_NUMBER_DIGITS = 2;

/**
 * What the header says of the stage: its skill, wall time and cost as its
 * record keeps them, or pending while the stage has not ended.
 */
function figuresReading(stage: MonitoredStage): string {
	if (!hasEnded(stage)) {
		return "skill pending · wall time pending · cost pending";
	}

	return [
		skillReading(stage),
		wallTimeReading(stage),
		stageCostReading(stage),
	].join(" · ");
}

function verdictReading(
	stage: MonitoredStage,
	record: RunRecordResponse,
): string {
	if (!hasEnded(stage)) {
		return STATUS_VOCABULARY.pending.word;
	}
	const status = endedStatus(stage);

	return status === "accepted"
		? continuationReading(record.minimumGrade)
		: STATUS_VOCABULARY[status].word;
}

/** The stage's grade as a letter, or why the header has none to show. */
interface GradeReadingProps {
	readonly stage: MonitoredStage;
}

function GradeReading({ stage }: GradeReadingProps): React.JSX.Element {
	if (stage.grade.state === "available") {
		return <Grade size="node" value={{ letter: stage.grade.letter }} />;
	}

	return (
		<span className="text-12 text-secondary-foreground">
			{hasEnded(stage)
				? notRecorded("grade", stage.grade.reasons)
				: "grade pending"}
		</span>
	);
}

function stepName(record: RunRecordResponse, stage: string): string {
	const index = record.stages.findIndex((each) => each.stage === stage);

	return `step ${String(index + ORDINAL_BASE).padStart(STEP_NUMBER_DIGITS, "0")}`;
}

/** The judge in one line: its fired blockers and returned dimensions. */
function judgeLine(
	judge: StageJudgeResponse | "unreadable" | undefined,
): string {
	if (judge === undefined || judge === "unreadable") {
		return judge === undefined
			? "reading the judge"
			: "Could not read this step's judge.";
	}
	switch (judge.state) {
		case "judged": {
			return judgedSummary(judge);
		}
		case "not-judged": {
			return "not judged: the step ended without a judged grade";
		}
		case "returning": {
			return judge.progress === undefined
				? "judge pending"
				: returningJudgeSummary(judge.progress);
		}
		case "waiting": {
			return "judge pending";
		}
		default: {
			return judge satisfies never;
		}
	}
}

function judgedSummary(
	judge: Extract<StageJudgeResponse, { readonly state: "judged" }>,
): string {
	const fired = judge.hardBlockers.filter(
		({ status }) => status === "FAIL",
	).length;

	return `${String(fired)} of ${plural(judge.hardBlockers.length, "blocker")} fired · ${plural(judge.dimensions.length, "dimension")} returned`;
}

function returningJudgeSummary(
	progress: NonNullable<
		Extract<StageJudgeResponse, { readonly state: "returning" }>["progress"]
	>,
): string {
	const { hardBlockers, dimensions } = progress.sections;

	return `${String(hardBlockers.returned)} of ${plural(hardBlockers.total, "blocker")} evaluated · ${String(dimensions.returned)} of ${plural(dimensions.total, "dimension")} returned`;
}

export {
	figuresReading,
	GradeReading,
	judgeLine,
	STEP_NUMBER_DIGITS,
	stepName,
	verdictReading,
};
