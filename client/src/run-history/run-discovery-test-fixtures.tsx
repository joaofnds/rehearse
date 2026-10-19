import { screen, within } from "@testing-library/react";

import {
	UNREAD_GROUP_FIGURES,
	UNREAD_REPLAY_FIGURES,
	UNREAD_RUN_FIGURES,
	UNREAD_SESSION_ATTEMPT_FIGURES,
} from "#client/test-support/run-figures";
import type {
	ConfirmationGroupRow,
	PipelineRunRow,
	ReplayRow,
	SessionAttemptRow,
} from "#server/run-history";

const CURRENT_CORPUS_VERSION_DISTANCE = 0;

const PREVIOUS_CORPUS_VERSION_DISTANCE = 1;

const TABLE_HEADER_ROW_COUNT = 1;

const QUALITY_FAILURE_COUNT = 1;

const NO_QUALITY_FAILURES = 0;

const FINAL_URL_PATH_SEGMENT_OFFSET = -1;

const originalFetch = globalThis.fetch;

function run(
	id: string,
	verdict?: "PASS" | "FAIL",
	current = true,
): PipelineRunRow {
	return {
		...UNREAD_RUN_FIGURES,
		caseId: "audit",
		checkpoints: [],
		corpusChangedDuringRun: false,
		corpusVersion: { digest: "abc", kind: "version" },
		finalOutcome:
			verdict === undefined
				? UNREAD_RUN_FIGURES.finalOutcome
				: { state: "available", status: "JUDGED", verdict },
		grade: "A",
		kind: "run",
		launchId: undefined,
		links: [],
		progress: { state: "recorded" },
		recordId: `run:${id}`,
		run: id,
		shortId: `audit/${id}`,
		stage: "build",
		staleness: {
			causes: [],
			changedFiles: [],
			distance: {
				kind: "measured",
				versions: current
					? CURRENT_CORPUS_VERSION_DISTANCE
					: PREVIOUS_CORPUS_VERSION_DISTANCE,
			},
			onlyCorpusFiles: false,
			stale: !current,
			state: "available",
		},
		status: "COMPLETE",
	};
}

function visibleRunIds(): readonly string[] {
	return within(screen.getByRole("table", { name: "Run history" }))
		.getAllByRole("row")
		.slice(TABLE_HEADER_ROW_COUNT)
		.map((row) => {
			const link = within(within(row).getByRole("rowheader")).getByRole("link");
			return decodeURIComponent(
				new URL(link.getAttribute("href") ?? "", "http://localhost").pathname
					.split("/")
					.at(FINAL_URL_PATH_SEGMENT_OFFSET) ?? "",
			);
		});
}

interface StoppedRunJudgment {
	readonly minimum: string;
	readonly letter: string;
	readonly reachesMinimum: boolean;
}

const TIMED_PIPELINE = run("2026-10-01T10-30-00.000Z");

const TIMED_SESSION: SessionAttemptRow = {
	...UNREAD_SESSION_ATTEMPT_FIGURES,
	caseId: "audit",
	corpusVersion: undefined,
	kind: "session-attempt",
	links: [],
	recordId: "session:timed",
	shortId: undefined,
	staleness: TIMED_PIPELINE.staleness,
	startedAt: "2026-10-01T10:45:00.000Z",
	status: "SUCCESSFUL",
	uuid: "timed-session",
};

const TIMED_GROUP: ConfirmationGroupRow = {
	...UNREAD_GROUP_FIGURES,
	caseId: "audit",
	checkpoint: undefined,
	corpusVersion: undefined,
	groupId: "timed-group",
	kind: "group",
	links: [],
	mode: "session",
	recordId: "group:timed",
	repAttempts: [],
	reps: 1,
	shortId: undefined,
	staleness: TIMED_PIPELINE.staleness,
	startedAt: "2026-10-01T10:15:00.000Z",
};

const TIMED_REPLAY: ReplayRow = {
	...UNREAD_REPLAY_FIGURES,
	attempt: undefined,
	caseId: "audit",
	checkpointShortId: undefined,
	corpusVersion: undefined,
	grade: "C",
	kind: "replay",
	lineage: "lineage",
	links: [],
	recordId: "replay:timed",
	shortId: undefined,
	stage: "build",
	staleness: TIMED_PIPELINE.staleness,
	status: "STOP",
	timestamp: "2026-10-01T11-00-00.000Z",
};

const UNTIMED_SESSION = {
	...TIMED_SESSION,
	startedAt: undefined,
	uuid: "legacy-session",
};

const MIXED_RECORD_ROWS = [
	TIMED_PIPELINE,
	TIMED_SESSION,
	TIMED_GROUP,
	UNTIMED_SESSION,
	TIMED_REPLAY,
];

function stopped(
	id: string,
	{ minimum, letter, reachesMinimum }: StoppedRunJudgment,
): PipelineRunRow {
	return {
		...run(id),
		minimumGrade: { letter: minimum, state: "available" },
		stageGrades: {
			grades: [
				{
					grade: {
						letter,
						reachesMinimum,
						state: "available",
						verdict: reachesMinimum ? "STOP" : "CONTINUE",
					},
					stage: "build",
					status: "stopped",
				},
			],
			state: "available",
		},
		status: "STOPPED:build",
	};
}

function group(
	groupId: string,
	mode: "stage" | "session",
	qualityFailures: number,
): ConfirmationGroupRow {
	return {
		...UNREAD_GROUP_FIGURES,
		caseId: "audit",
		checkpoint: undefined,
		corpusVersion: undefined,
		finalOutcomes: { NOT_APPLICABLE: 2 },
		groupId,
		kind: "group",
		links: [],
		mode,
		qualityFailures,
		recordId: `group:${groupId}`,
		repAttempts: [],
		reps: 2,
		shortId: undefined,
		staleness: run("scope").staleness,
	};
}

const SORT_NEWER = "2026-10-10T12-30-00.000Z";

const SORT_OLDER = "2026-10-01T10-00-00.000Z";

const SORT_PARTIAL = "2026-10-05T11-00-00.000Z";

export {
	group,
	MIXED_RECORD_ROWS,
	NO_QUALITY_FAILURES,
	originalFetch,
	QUALITY_FAILURE_COUNT,
	run,
	SORT_NEWER,
	SORT_OLDER,
	SORT_PARTIAL,
	stopped,
	TIMED_GROUP,
	TIMED_PIPELINE,
	TIMED_REPLAY,
	TIMED_SESSION,
	UNTIMED_SESSION,
	visibleRunIds,
};

export type { StoppedRunJudgment };
