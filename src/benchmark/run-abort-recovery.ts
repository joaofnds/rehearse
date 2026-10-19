import type { RunArtifact } from "./contracts";
import type RunAbortArtifactLifecycle from "./run-abort-artifact-lifecycle";
import { writeRunArtifact } from "./run-abort-artifact-records";
import type {
	CeilingStop,
	OperatorStop,
	PendingStage,
	RunAbortDependencies,
	RunAbortRequest,
} from "./run-abort-contracts";
import type RunAbortEvents from "./run-abort-events";
import type RunAbortStageLifecycle from "./run-abort-stage-lifecycle";
import {
	writeCeilingStop,
	writeOperatorStop,
	writeStageJudgeFailure,
} from "./run-abort-stage-records";
import type RunAbortTransitions from "./run-abort-transitions";

interface AbortRecoveryDependencies {
	readonly dependencies: RunAbortDependencies;
	readonly request: RunAbortRequest;
	readonly stages: Readonly<RunAbortStageLifecycle>;
	readonly artifacts: Readonly<RunAbortArtifactLifecycle>;
	readonly events: Readonly<RunAbortEvents>;
	readonly transitions: Readonly<RunAbortTransitions>;
}

interface AbortSnapshot {
	readonly reason: string;
	readonly stage: PendingStage | undefined;
	readonly ceiling: CeilingStop | undefined;
	readonly artifact: RunArtifact | undefined;
	readonly operatorStop: OperatorStop | undefined;
}

class RunAbortRecovery {
	private recorded: Promise<void> | undefined = undefined;

	public constructor(private readonly props: AbortRecoveryDependencies) {}

	public readonly markAborted = async (
		reason: string,
		operatorStop?: OperatorStop,
	): Promise<void> => {
		if (this.recorded === undefined) {
			this.props.transitions.requestAbort();

			const snapshot = {
				artifact: this.props.artifacts.pending,
				ceiling: this.props.stages.ceiling,
				operatorStop,
				reason,
				stage: this.props.stages.pending,
			};

			this.recorded = this.props.transitions.enqueue(async () => {
				await this.record(snapshot);
			});
		}
		await this.recorded;
	};

	private async record(snapshot: AbortSnapshot): Promise<void> {
		if (snapshot.operatorStop !== undefined) {
			await this.attemptOperatorStop(snapshot.operatorStop);
		}
		this.props.events.aborted(snapshot);
		await this.recordStage(snapshot);

		const { artifact } = snapshot;

		if (artifact !== undefined) {
			await this.attemptArtifactWrite(async () => {
				await writeRunArtifact(
					this.props.request.artifactFile,
					{ ...artifact, status: "FAILED" },
					this.props.dependencies.persistence,
				);
			});
		}
	}

	private async recordStage({
		stage,
		ceiling,
		operatorStop,
		reason,
	}: AbortSnapshot): Promise<void> {
		if (stage !== undefined) {
			await this.attemptArtifactWrite(async () => {
				await writeStageJudgeFailure(
					{ ...stage, operatorStop },
					reason,
					this.props.dependencies.persistence,
				);
			});
		}
		if (stage === undefined && ceiling !== undefined) {
			await this.attemptArtifactWrite(async () => {
				await writeCeilingStop(
					ceiling,
					reason,
					this.props.dependencies.persistence,
				);
			});
		}
	}

	private async attemptOperatorStop(stop: OperatorStop): Promise<void> {
		try {
			await writeOperatorStop(
				this.props.request.operatorStopFile,
				stop,
				this.props.dependencies.persistence,
			);
		} catch (error) {
			this.props.dependencies.reportError(
				`Failed to record the operator stop: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private async attemptArtifactWrite(
		write: () => Promise<void>,
	): Promise<void> {
		try {
			await write();
		} catch (error) {
			this.props.dependencies.reportError(
				`Failed to update run artifacts: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}

export { RunAbortRecovery as default };
