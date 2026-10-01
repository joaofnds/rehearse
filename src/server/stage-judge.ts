import type { Immutable, RecordedStageEvidence } from "#benchmark/contracts";
import { locatorReading } from "#benchmark/record-summary";
import type { JudgeProgress, RunEvent } from "#benchmark/run-events";
import { openRunEventStore } from "#benchmark/run-events";
import { runEventsDatabaseFile } from "#benchmark/run-layout";
import type { JudgedGrade } from "./stage-record";
import { readStageRecord, verifiedStageOfRun } from "./stage-record";

export interface StageJudgeRequest {
	readonly runsDirectory: string;
	readonly run: string;
	readonly stage: string;
}

/** One piece of evidence a judged item cites, its place read as a sentence. */
export interface JudgedEvidence {
	readonly source: RecordedStageEvidence["source"];
	readonly path: string;
	readonly claim: string;
	readonly quote?: string;
	readonly place?: string;
}

export interface JudgedBlocker {
	readonly id: string;
	readonly status: JudgedGrade["hardBlockers"][number]["status"];
	readonly evidence: readonly JudgedEvidence[];
}

export interface JudgedDimension {
	readonly id: string;
	readonly grade: JudgedGrade["dimensions"][number]["grade"];
	readonly evidence: readonly JudgedEvidence[];
}

/**
 * A stage's judge as the judge pane shows it: not started, returning items
 * with what its rejected attempts have been charged so far, its recorded
 * blockers and dimensions, or a stage record the judge never graded.
 */
export type StageJudge =
	| { readonly state: "waiting" }
	| {
			readonly state: "returning";
			readonly progress?: Extract<JudgeProgress, { state: "returning" }>;
			readonly spentUsd?: number;
	  }
	| {
			readonly state: "judged";
			readonly hardBlockers: readonly JudgedBlocker[];
			readonly dimensions: readonly JudgedDimension[];
	  }
	| { readonly state: "not-judged" };

function judgedEvidence(
	evidence: JudgedGrade["hardBlockers"][number]["evidence"],
): readonly JudgedEvidence[] {
	return evidence.map(({ source, path, claim, quote, locator }) => ({
		source,
		path,
		claim,
		...(quote !== undefined && { quote }),
		...(locator !== undefined && { place: locatorReading(locator) }),
	}));
}

function judgedStage(grade: Immutable<JudgedGrade>): StageJudge {
	return {
		state: "judged",
		hardBlockers: grade.hardBlockers.map(({ id, status, evidence }) => ({
			id,
			status,
			evidence: judgedEvidence(evidence),
		})),
		dimensions: grade.dimensions.map(({ id, grade: letter, evidence }) => ({
			id,
			grade: letter,
			evidence: judgedEvidence(evidence),
		})),
	};
}

/**
 * What the judge's run spend has grown by since judging began, or nothing
 * where either event was recorded before run spend was.
 */
function spentSince(judging: RunEvent, latest: RunEvent): number | undefined {
	if (judging.runSpentUsd === undefined || latest.runSpentUsd === undefined) {
		return undefined;
	}

	return latest.runSpentUsd - judging.runSpentUsd;
}

/**
 * The judge's latest reading since the stage's latest judging began. A
 * rejected attempt withdraws what it returned, so a reading after it shows
 * no progress until the next attempt reports.
 */
function returningJudge(events: readonly RunEvent[]): StageJudge {
	const judgingAt = events.findLastIndex(
		({ kind }) => kind === "stage-judging",
	);
	const judging = events[judgingAt];
	if (judging === undefined) {
		return { state: "waiting" };
	}

	const since = events.slice(judgingAt);
	const latest = since.at(-1) ?? judging;
	const progress = since.findLast(
		({ kind }) => kind === "judge-progress",
	)?.judge;
	const spentUsd = spentSince(judging, latest);

	return {
		state: "returning",
		...(progress?.state === "returning" && { progress }),
		...(spentUsd !== undefined && { spentUsd }),
	};
}

async function stageEvents(
	runsDirectory: string,
	run: string,
	stage: string,
): Promise<readonly RunEvent[]> {
	const store = await openRunEventStore(runEventsDatabaseFile(runsDirectory));

	try {
		return store.eventsSince(run, 0).filter((event) => event.stage === stage);
	} finally {
		store.close();
	}
}

export async function readStageJudge(
	request: StageJudgeRequest,
): Promise<StageJudge> {
	const stageOfRun = await verifiedStageOfRun(request);
	const record = await readStageRecord(stageOfRun);
	if (record.state === "judged") {
		return judgedStage(record.grade);
	}
	if (record.state === "not-judged") {
		return { state: "not-judged" };
	}

	return returningJudge(
		await stageEvents(request.runsDirectory, stageOfRun.run, stageOfRun.stage),
	);
}
