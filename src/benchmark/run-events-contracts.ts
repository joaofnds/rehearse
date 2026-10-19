import type { JudgeProgress } from "./run-events-judge-progress";
import type { PlainRunEventKind } from "./run-events-kinds";
import type { RunTokens } from "./spend-ceiling";

interface RunEventFields {
	readonly runId: string;
	readonly stage: string;
	readonly spentUsd: number;
	/**
	 * What the run's ceiling has charged when the event is recorded, Judges
	 * and the Product Owner included, unlike `spentUsd`, whose scope depends
	 * on the kind. Undefined on events recorded before it existed. An
	 * interruption reconciliation writes from outside the run carries the
	 * figure of the run's last event.
	 */
	readonly runSpentUsd?: number | undefined;
	/** The run's tokens as its ceiling tallies them, with `runSpentUsd`'s reach. */
	readonly runTokens?: RunTokens | undefined;
	readonly elapsedMs: number;
}

type NewRunEvent = RunEventFields &
	(
		| {
				readonly kind: Exclude<PlainRunEventKind, "stage-started">;
				readonly judge?: undefined;
				readonly sessionId?: undefined;
		  }
		| {
				readonly kind: "stage-started";
				readonly judge?: undefined;
				/**
				 * The provider session the stage runs under, which names its
				 * transcript on disk. Undefined on events recorded before it existed.
				 */
				readonly sessionId?: string | undefined;
		  }
		| {
				readonly kind: "judge-progress";
				readonly judge: JudgeProgress;
				readonly sessionId?: undefined;
		  }
	);

type RunEvent = NewRunEvent & {
	readonly sequence: number;
	readonly recordedAt: string;
};

interface StageOfRun {
	readonly runId: string;
	readonly stage: string;
}

interface RunEventStore {
	readonly append: (event: NewRunEvent) => RunEvent;
	readonly eventsSince: (
		runId: string,
		sequence: number,
	) => readonly RunEvent[];
	readonly firstEvent: (runId: string) => RunEvent | undefined;
	readonly latestEvent: (runId: string) => RunEvent | undefined;
	/** The newest stage-started event of this stage of this run, if any. */
	readonly latestStageStart: (stageOfRun: StageOfRun) => RunEvent | undefined;
	readonly runIds: () => readonly string[];
	readonly journalMode: () => string;
	readonly close: () => void;
}

interface StageEventMetrics {
	readonly spentUsd: number;
	readonly elapsedMs: number;
}

interface RunEventRecorder {
	readonly record: (
		kind: Exclude<PlainRunEventKind, "stage-started">,
		stage: string,
		metrics: StageEventMetrics,
	) => void;
	readonly recordJudgeProgress: (
		stage: string,
		metrics: StageEventMetrics,
		judge: JudgeProgress,
	) => void;
	readonly recordStageStarted: (
		stage: string,
		metrics: StageEventMetrics,
		sessionId: string,
	) => void;
}

export type {
	NewRunEvent,
	RunEvent,
	RunEventStore,
	StageEventMetrics,
	RunEventRecorder,
};
