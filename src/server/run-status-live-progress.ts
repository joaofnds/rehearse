import type { NonTerminalRunEvent } from "#benchmark/run-ending";
import type { NonTerminalRunEventKind, RunEvent } from "#benchmark/run-events";
import type { RunProgress } from "#server/run-status-contract";
/**
 * What a run's `spentUsd` covers, in words, decided by the event kind that
 * produced the figure. Every kind reports a different scope and none of them
 * is the run total: a display that called them all "spent this run" would
 * show a number that falls when a stage begins judging. The words are chosen
 * here rather than in the client because which scope a kind carries is the
 * emitter's knowledge, verified at each emission site in `run.ts`,
 * `workflow.ts` and `run-abort.ts`.
 */
const SPEND_SCOPE = {
	"judge-progress": "this stage's session",
	"stage-completed": "this stage's session and its judge",
	"stage-judging": "this stage's session",
	"stage-started": "the stages finished before this one",
	"turn-completed": "this stage's session so far",
} as const satisfies Record<NonTerminalRunEventKind, string>;

/** Where the running stage is, in the design's words, by the latest event's kind. */
const STAGE_STATE = {
	"judge-progress": "judge grading",
	"stage-completed": "judged",
	"stage-judging": "judge grading",
	"stage-started": "session running",
	"turn-completed": "session running",
} as const satisfies Record<NonTerminalRunEventKind, string>;

interface RunningProgressContext {
	readonly latest: NonTerminalRunEvent;
	readonly stageStart: RunEvent | undefined;
}

function runningProgress({
	latest,
	stageStart,
}: RunningProgressContext): RunProgress {
	const spendScope = SPEND_SCOPE[latest.kind];

	const progress: RunProgress = {
		ceilingUsd: undefined,
		elapsedMs: latest.elapsedMs,
		measuredAt: latest.recordedAt,
		runSpentUsd: latest.runSpentUsd,
		runTokens: latest.runTokens,
		spendScope,
		spentUsd: latest.spentUsd,
		stage: latest.stage,
		stageElapsedMs:
			stageStart === undefined
				? undefined
				: latest.elapsedMs - stageStart.elapsedMs,
		stageState: STAGE_STATE[latest.kind],
		state: "running",
	};
	if (latest.kind !== "judge-progress") {
		return progress;
	}

	return { ...progress, judge: latest.judge };
}

export { runningProgress as default, SPEND_SCOPE, STAGE_STATE };
