import type { LocalCheckResult } from "./contracts";
import type { JudgeBudget } from "./judge-attempt";
import type { SignalStopHandler, SignalStopOutcome } from "./process-signals";
import type { RunAbortDependencies } from "./run-abort";
import type { RunEventKind, RunEventRecorder } from "./run-events";
import type { SpendCeiling } from "./spend-ceiling";
import { createSpendCeiling } from "./spend-ceiling";

function harnessResult(
	status: "PASS" | "FAIL",
	claim: string,
): LocalCheckResult {
	return {
		evidence: [
			{
				claim,
				path: "harness",
				source: "local-checks",
			},
		],
		status,
	};
}

/** A ceiling far above anything a test's fake providers report. */
function ampleSpendCeiling(): SpendCeiling {
	return createSpendCeiling({ ceilingUsd: 100 });
}

function judgeBudget(): JudgeBudget {
	return { sessionBudgetUsd: 5, spendCeiling: ampleSpendCeiling() };
}

/** A signal registry that never touches the test process's handlers or exit. */
function fakeRunAbortSignals(): Pick<
	RunAbortDependencies,
	"registerSignal" | "releaseSignal"
> & {
	readonly emit: (
		signal: NodeJS.Signals,
	) => Promise<SignalStopOutcome | undefined>;
} {
	const handlers = new Map<NodeJS.Signals, SignalStopHandler>();
	return {
		emit: async (signal) => await handlers.get(signal)?.(signal),
		registerSignal: (signal, handler) => {
			handlers.set(signal, handler);
		},
		releaseSignal: (signal, handler) => {
			if (handlers.get(signal) === handler) {
				handlers.delete(signal);
			}
		},
	};
}

interface RecordedRunEvent {
	readonly kind: RunEventKind;
	readonly stage: string;
	readonly spentUsd: number;
	readonly elapsedMs: number;
}

interface FakeRunEventRecorder extends RunEventRecorder {
	readonly events: RecordedRunEvent[];
}

function fakeRunEventRecorder(): FakeRunEventRecorder {
	const events: RecordedRunEvent[] = [];

	return {
		events,
		record: (kind, stage, { spentUsd, elapsedMs }) => {
			events.push({ elapsedMs, kind, spentUsd, stage });
		},
		recordJudgeProgress: (stage, { spentUsd, elapsedMs }) => {
			events.push({ elapsedMs, kind: "judge-progress", spentUsd, stage });
		},
		recordStageStarted: (stage, { spentUsd, elapsedMs }) => {
			events.push({ elapsedMs, kind: "stage-started", spentUsd, stage });
		},
	};
}

export {
	harnessResult,
	ampleSpendCeiling,
	judgeBudget,
	fakeRunAbortSignals,
	fakeRunEventRecorder,
};
