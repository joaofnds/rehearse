import plural from "#client/plural";
import { spendReading } from "#client/run-history/run-progress";
import { STATUS_VOCABULARY } from "#client/system/components/status";

import type { BlockerRow, DimensionRow, JudgedAnswer } from "./judged-items";
import { blockerState } from "./judged-items";
import type {
	EndedStage,
	MonitoredStage,
	RunRecordResponse,
} from "./run-record-query";
import { continuationReading, endedStatus } from "./run-record-query";
import type { StageJudgeResponse } from "./stage-judge-query";

const NO_SPEND_USD = 0;

type ReturningJudge = Extract<
	StageJudgeResponse,
	{ readonly state: "returning" }
>;

type JudgeProgress = NonNullable<ReturningJudge["progress"]>;

interface SectionCount {
	readonly returned: number;
	readonly total: number;
}

/**
 * What the pane lists: each section's count, and its rows unless the
 * progress predates per-item results.
 */
interface JudgedItems {
	readonly blockers: {
		readonly count: SectionCount;
		readonly rows: readonly BlockerRow[] | undefined;
	};
	readonly dimensions: {
		readonly count: SectionCount;
		readonly rows: readonly DimensionRow[] | undefined;
	};
}

interface Verdict {
	readonly glyph: string;
	readonly phrase: string;
	readonly grade: string | undefined;
}

function returningItems(progress: JudgeProgress): JudgedItems {
	const { sections, items } = progress;

	return {
		blockers: {
			count: sections.hardBlockers,
			rows: items?.hardBlockers.map(({ id, status }) => ({
				evidence: "pending",
				id,
				state: blockerState(status),
			})),
		},
		dimensions: {
			count: sections.dimensions,
			rows: items?.dimensions.map(({ id, grade }) => ({
				evidence: "pending",
				grade,
				id,
			})),
		},
	};
}

function judgedItems(judge: JudgedAnswer): JudgedItems {
	const { hardBlockers, dimensions } = judge;

	return {
		blockers: {
			count: { returned: hardBlockers.length, total: hardBlockers.length },
			rows: hardBlockers.map(({ id, status, evidence }) => ({
				evidence,
				id,
				state: blockerState(status),
			})),
		},
		dimensions: {
			count: { returned: dimensions.length, total: dimensions.length },
			rows: dimensions,
		},
	};
}

const GRADE_NOT_RECORDED = "pending: grade not recorded yet";

/** What the judge still owes while it returns, in the design's pending phrase. */
function pendingPhrase(progress: JudgeProgress | undefined): string {
	if (progress === undefined) {
		return "pending: nothing returned yet";
	}
	const { hardBlockers, dimensions } = progress.sections;
	if (dimensions.returned < dimensions.total) {
		return "pending: dimensions still returning";
	}
	if (hardBlockers.returned < hardBlockers.total) {
		return "pending: blockers still returning";
	}

	return GRADE_NOT_RECORDED;
}

function pendingVerdict(phrase: string): Verdict {
	return {
		glyph: STATUS_VOCABULARY.pending.glyph,
		grade: undefined,
		phrase,
	};
}

function judgedVerdict(
	judge: JudgedAnswer,
	figures: EndedStage,
	minimum: RunRecordResponse["minimumGrade"] | undefined,
): Verdict {
	const ended = endedStatus(figures);
	const fired = judge.hardBlockers.filter(
		({ status }) => status === "FAIL",
	).length;

	return {
		glyph: STATUS_VOCABULARY[ended].glyph,
		grade:
			figures.grade.state === "available" ? figures.grade.letter : undefined,
		phrase: `${ended === "accepted" ? continuationReading(minimum) : STATUS_VOCABULARY[ended].word}: ${plural(fired, "blocker")} fired`,
	};
}

/** The header's reading of the judge as its own priced session. */
function judgeMeta(
	judge: StageJudgeResponse,
	figures: MonitoredStage,
): string | undefined {
	if (judge.state === "returning") {
		return `independent session · ${
			judge.spentUsd === undefined || judge.spentUsd === NO_SPEND_USD
				? "cost pending"
				: `${spendReading(judge.spentUsd)} so far`
		}`;
	}
	if (judge.state !== "judged") {
		return undefined;
	}

	return figures.judgeCost.state === "available"
		? `independent session · ${spendReading(figures.judgeCost.usd)}`
		: "independent session";
}

export {
	GRADE_NOT_RECORDED,
	judgedItems,
	judgedVerdict,
	judgeMeta,
	pendingPhrase,
	pendingVerdict,
	returningItems,
};
export type { JudgedItems, SectionCount, Verdict };
