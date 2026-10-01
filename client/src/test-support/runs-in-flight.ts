import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { UNREAD_RUN_FIGURES } from "./run-figures";

type HistoryRow = RunHistoryResponse["rows"][number];
type PipelineRow = Extract<HistoryRow, { readonly kind: "run" }>;
type RunningProgress = Extract<
	PipelineRow["progress"],
	{ readonly state: "running" }
>;
type StageGrade = Extract<
	PipelineRow["stageGrades"],
	{ readonly state: "available" }
>["grades"][number];

const RUN = "2026-09-30T10-00-00.000Z";

export function graded(
	stage: string,
	letter: string,
	verdict = "CONTINUE",
): StageGrade {
	return {
		stage,
		status: "graded",
		grade: { state: "available", letter, verdict },
	};
}

export function notYet(stage: string): StageGrade {
	return {
		stage,
		status: "no-record",
		grade: { state: "unavailable", reasons: ["the stage wrote no record"] },
	};
}

export function runRow(props: {
	readonly run?: string;
	readonly status?: string;
	readonly stage?: string;
	readonly stageState?: RunningProgress["stageState"];
	readonly grades?: readonly StageGrade[];
	readonly runSpentUsd?: number;
	readonly runTokens?: { readonly input: number; readonly output: number };
	readonly ceilingUsd?: number;
	readonly launchId?: string | undefined;
	readonly elapsedMs?: number;
	readonly stageElapsedMs?: number;
	readonly measuredAt?: string;
	readonly corpusVersion?: PipelineRow["corpusVersion"];
}): PipelineRow {
	const status = props.status ?? "RUNNING";

	return {
		kind: "run",
		...UNREAD_RUN_FIGURES,
		stageGrades:
			props.grades === undefined
				? UNREAD_RUN_FIGURES.stageGrades
				: { state: "available", grades: props.grades },
		launchId: props.launchId,
		shortId: "r-0148",
		checkpoints: [],
		links: [],
		run: props.run ?? RUN,
		caseId: "audit-log",
		status,
		stage: undefined,
		grade: undefined,
		corpusVersion: props.corpusVersion,
		corpusChangedDuringRun: false,
		staleness: { state: "unavailable", reasons: ["not read by this test"] },
		progress:
			status === "RUNNING"
				? {
						state: "running",
						stage: props.stage ?? "build",
						stageState: props.stageState ?? "session running",
						elapsedMs: props.elapsedMs ?? 9000,
						stageElapsedMs: props.stageElapsedMs,
						measuredAt: props.measuredAt ?? "2026-09-30T10:00:09.000Z",
						spentUsd: 0.9,
						spendScope: "this stage's session so far",
						runSpentUsd: props.runSpentUsd,
						runTokens: props.runTokens,
						ceilingUsd: props.ceilingUsd,
					}
				: { state: "recorded" },
	};
}
