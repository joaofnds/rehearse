import type { StageJudgeRecord } from "./contracts";
import type {
	CeilingStop,
	PendingStage,
	RunArtifactPersistence,
} from "./run-abort-contracts";
import type RunAbortEvents from "./run-abort-events";
import type RunAbortTransitions from "./run-abort-transitions";
import stageRecordJson from "./stage-record-json";

interface StageLifecycleDependencies {
	readonly events: Readonly<RunAbortEvents>;
	readonly transitions: Readonly<RunAbortTransitions>;
	readonly persistence: RunArtifactPersistence;
}

class RunAbortStageLifecycle {
	private pendingStage: PendingStage | undefined = undefined;
	private ceilingStop: CeilingStop | undefined = undefined;

	public get pending(): PendingStage | undefined {
		return this.pendingStage;
	}

	public get ceiling(): CeilingStop | undefined {
		return this.ceilingStop;
	}

	public constructor(private readonly props: StageLifecycleDependencies) {}

	public readonly writePendingStage = async (
		pending: PendingStage,
	): Promise<void> => {
		if (this.props.transitions.abortRequested) {
			return;
		}

		this.pendingStage = pending;
		await this.props.transitions.enqueueNormal(async () => {
			this.props.events.stageJudging(pending);
			await this.props.persistence.write(
				pending.file,
				stageRecordJson({
					json: JSON.stringify({
						corpusVersion: pending.corpusVersion,
						effort: pending.effort,
						input: pending.input,
						judgeEffort: pending.judgeEffort,
						judgeModel: pending.judgeModel,
						model: pending.model,
						sessionBudgetUsd: pending.sessionBudgetUsd,
						stage: pending.stage,
						status: "AWAITING_STAGE_JUDGE",
					}),
					kind: "pending",
				}),
			);
		});
	};

	public readonly writeStageProgress = async (
		record: StageJudgeRecord,
	): Promise<void> => {
		if (this.props.transitions.abortRequested) {
			return;
		}

		if (this.pendingStage === undefined) {
			throw new Error("No stage transition is pending");
		}

		const { file } = this.pendingStage;

		await this.props.transitions.enqueueNormal(async () => {
			await this.props.persistence.write(
				file,
				stageRecordJson({ json: JSON.stringify(record) }),
			);
		});
	};

	public readonly completeStage = async (
		record: StageJudgeRecord,
	): Promise<void> => {
		if (this.props.transitions.abortRequested) {
			return;
		}

		if (this.pendingStage === undefined) {
			throw new Error("No stage transition is pending");
		}

		const { file, stage } = this.pendingStage;

		await this.props.transitions.enqueueNormal(async () => {
			this.props.events.stageCompleted(stage, record);
			await this.props.persistence.write(
				file,
				stageRecordJson({ json: JSON.stringify(record) }),
			);
			this.pendingStage = undefined;
		});
	};

	public readonly stopAtCeiling = (stop: CeilingStop): void => {
		if (this.props.transitions.abortRequested) {
			return;
		}

		const readings = { ceilingUsd: stop.ceilingUsd, spentUsd: stop.spentUsd };

		if (this.pendingStage?.stage === stop.stage) {
			this.pendingStage = {
				...this.pendingStage,
				ceilingStop: readings,
				productOwner: stop.productOwner,
			};
		} else {
			this.ceilingStop = stop;
		}
	};

	public readonly updatePendingStage = (pending: PendingStage): void => {
		if (!this.props.transitions.abortRequested) {
			this.pendingStage = pending;
		}
	};
}

export { RunAbortStageLifecycle as default };
