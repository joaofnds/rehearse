import type {
	NewRunEvent,
	RunEventRecorder,
	RunEventStore,
} from "./run-events-contracts";
import type { SpendCeiling } from "./spend-ceiling";

function runEventRecorderFor(
	store: RunEventStore,
	runId: string,
	ceiling: Pick<SpendCeiling, "spentUsd" | "tokens">,
): RunEventRecorder {
	const append = (event: NewRunEvent): void => {
		try {
			store.append({
				...event,
				runSpentUsd: ceiling.spentUsd(),
				runTokens: ceiling.tokens(),
			});
		} catch {
			// Best-effort: the event stream can drop an entry without
			// affecting the run it describes.
		}
	};

	return {
		record: (kind, stage, { spentUsd, elapsedMs }) => {
			append({ elapsedMs, kind, runId, spentUsd, stage });
		},
		recordJudgeProgress: (stage, { spentUsd, elapsedMs }, judge) => {
			append({
				elapsedMs,
				judge,
				kind: "judge-progress",
				runId,
				spentUsd,
				stage,
			});
		},
		recordStageStarted: (stage, { spentUsd, elapsedMs }, sessionId) => {
			append({
				elapsedMs,
				kind: "stage-started",
				runId,
				sessionId,
				spentUsd,
				stage,
			});
		},
	};
}

export { runEventRecorderFor as default };
