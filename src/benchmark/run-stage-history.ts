import type { CheckpointRecord } from "./checkpoint";
import type { ContextFile, StageScorecard, StageTranscript } from "./contracts";
import type { BuildEvidence } from "./run-artifact";
import type { StageOutcome } from "./run-stage-contract";
import type { StageSessionResult } from "./stage-session-contract";

interface StageRunHistory {
	readonly workflow: readonly StageTranscript[];
	readonly scorecards: readonly StageScorecard[];
	readonly artifacts: readonly ContextFile[];
	readonly baselineSha: string;
	readonly upstream: string;
	readonly appendSession: (session: StageSessionResult) => void;
	readonly appendScorecard: (scorecard: StageScorecard) => void;
	readonly recordBuildEvidence: (evidence: BuildEvidence) => void;
	readonly advanceBaseline: (resultSha: string) => void;
	readonly keepCheckpoint: (checkpoint: CheckpointRecord) => void;
	readonly outcome: () => StageOutcome;
}

interface StageSequencePosition {
	readonly initialLineage: string;
	readonly taskSha: string;
}

class GradedStageHistory implements StageRunHistory {
	private readonly transcripts: StageTranscript[] = [];
	private readonly stageScorecards: StageScorecard[] = [];
	private readonly stageArtifacts: ContextFile[] = [];
	private readonly checkpoints: CheckpointRecord[] = [];
	private buildEvidence: BuildEvidence | undefined = undefined;
	private baseline: string;
	private lineage: string;
	public constructor({ initialLineage, taskSha }: StageSequencePosition) {
		this.baseline = taskSha;
		this.lineage = initialLineage;
	}
	public get workflow(): readonly StageTranscript[] {
		return this.transcripts;
	}
	public get scorecards(): readonly StageScorecard[] {
		return this.stageScorecards;
	}
	public get artifacts(): readonly ContextFile[] {
		return this.stageArtifacts;
	}
	public get baselineSha(): string {
		return this.baseline;
	}
	public get upstream(): string {
		return this.lineage;
	}
	public appendSession(session: StageSessionResult): void {
		this.transcripts.push(session.transcript);
		if (session.artifact) {
			this.stageArtifacts.push(session.artifact);
		}
	}
	public appendScorecard(scorecard: StageScorecard): void {
		this.stageScorecards.push(scorecard);
	}
	public recordBuildEvidence(evidence: BuildEvidence): void {
		this.buildEvidence = evidence;
	}
	public advanceBaseline(resultSha: string): void {
		this.baseline = resultSha;
	}
	public keepCheckpoint(checkpoint: CheckpointRecord): void {
		this.checkpoints.push(checkpoint);
		this.lineage = checkpoint.lineage;
	}
	public outcome(): StageOutcome {
		return {
			buildEvidence: this.buildEvidence,
			checkpoints: this.checkpoints,
			stageScorecards: this.stageScorecards,
			workflow: this.transcripts,
		};
	}
}

export { GradedStageHistory as default };

export type { StageRunHistory };
