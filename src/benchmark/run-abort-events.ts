import type { RunArtifact, StageJudgeRecord } from "./contracts";
import { totalSpentUsd } from "./run-abort-artifact-records";
import type {
	CeilingStop,
	PendingStage,
	RunAbortDependencies,
} from "./run-abort-contracts";

const FALLBACK_CLOCK_MS = 0;

const NO_REPORTED_COST_USD = 0;

interface AbortedRunReadings {
	readonly artifact: RunArtifact | undefined;
	readonly stage: PendingStage | undefined;
	readonly ceiling: CeilingStop | undefined;
}

class RunAbortEvents {
	private terminalRecorded = false;
	private readonly recorder: RunAbortDependencies["runEvents"];
	private readonly elapsedMs: () => number;

	public constructor(
		private readonly props: Pick<
			RunAbortDependencies,
			"reportError" | "runEvents" | "elapsedMs"
		>,
	) {
		this.recorder = props.runEvents;
		this.elapsedMs = props.elapsedMs ?? (() => FALLBACK_CLOCK_MS);
	}

	public stageJudging(pending: PendingStage): void {
		this.record(() => {
			this.recorder?.record("stage-judging", pending.stage, {
				elapsedMs: this.elapsedMs(),
				spentUsd: pending.input.transcript.costUsd,
			});
		});
	}

	public stageCompleted(stage: string, record: StageJudgeRecord): void {
		this.record(() => {
			this.recorder?.record("stage-completed", stage, {
				elapsedMs: this.elapsedMs(),
				spentUsd: record.input.transcript.costUsd + record.costUsd,
			});
		});
	}

	public artifactCompleted(
		artifact: RunArtifact,
		kind: "run-completed" | "run-failed",
	): void {
		this.record(() => {
			if (this.recorder !== undefined) {
				const spentUsd = totalSpentUsd(artifact);
				this.recorder.record(kind, "", {
					elapsedMs: this.elapsedMs(),
					spentUsd,
				});
			}
		});
		this.terminalRecorded = true;
	}

	public aborted({ artifact, stage, ceiling }: AbortedRunReadings): void {
		if (this.terminalRecorded) {
			return;
		}

		this.record(() => {
			if (this.recorder !== undefined) {
				const spentUsd =
					artifact === undefined
						? (stage?.input.transcript.costUsd ??
							ceiling?.session?.costUsd ??
							NO_REPORTED_COST_USD)
						: totalSpentUsd(artifact);
				this.recorder.record(
					"run-failed",
					stage?.stage ?? ceiling?.stage ?? "",
					{ elapsedMs: this.elapsedMs(), spentUsd },
				);
			}
		});
		this.terminalRecorded = true;
	}

	private record(record: () => void): void {
		try {
			record();
		} catch (error) {
			this.props.reportError(
				`Failed to record run event: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}

export { RunAbortEvents as default };
