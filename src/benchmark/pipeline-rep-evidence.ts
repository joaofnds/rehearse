import { relative } from "node:path";

import type { ConfirmationRepRecord } from "./confirmation-record";
import type {
	ContextFile,
	Immutable,
	ProviderCall,
	StageScorecard,
} from "./contracts";
import type {
	PipelineRepScope,
	PipelineStageInspection,
} from "./pipeline-rep-execution";
import type { StageClock } from "./pipeline-stage-clock";
import type { ReadManifestEntry } from "./read-manifest";
import type { BuildEvidence } from "./run-artifact";
import stageRecordJson from "./stage-record-json";
import type { StageSessionResult } from "./stage-session-contract";

const NEXT_SEQUENCE_ELEMENT_OFFSET = 1;
interface PipelineStageRecord {
	readonly inspection: PipelineStageInspection;
	readonly session: StageSessionResult;
	readonly scorecard: StageScorecard;
	readonly readManifest: readonly ReadManifestEntry[];
	readonly clock: StageClock;
}
class PipelineRepEvidence {
	private readonly stages: ConfirmationRepRecord["stages"] = [];
	private readonly workers: ProviderCall[] = [];
	private readonly judges: ProviderCall[] = [];
	private readonly artifacts: ContextFile[] = [];
	private lineage: PipelineRepScope["context"]["frozen"]["initialCheckpoint"]["lineage"];
	private baseline: string;
	private build: BuildEvidence | undefined = undefined;
	private result: string;
	public constructor(private readonly scope: PipelineRepScope) {
		this.lineage = scope.context.frozen.initialCheckpoint.lineage;
		this.baseline = scope.context.frozen.taskSha;
		this.result = scope.context.frozen.taskSha;
	}
	public get stageOutcomes(): Immutable<ConfirmationRepRecord["stages"]> {
		return this.stages;
	}
	public get workerCalls(): readonly ProviderCall[] {
		return this.workers;
	}
	public get stageJudgeCalls(): readonly ProviderCall[] {
		return this.judges;
	}
	public get priorArtifacts(): readonly ContextFile[] {
		return this.artifacts;
	}
	public get upstream(): PipelineRepScope["context"]["frozen"]["initialCheckpoint"]["lineage"] {
		return this.lineage;
	}
	public get baselineSha(): string {
		return this.baseline;
	}
	public get buildEvidence(): BuildEvidence | undefined {
		return this.build;
	}
	public get resultSha(): string {
		return this.result;
	}
	public recordWorker(session: StageSessionResult): void {
		this.workers.push(...session.transcript.providerCalls);
	}
	public recordJudge(scorecard: StageScorecard): void {
		this.judges.push(...scorecard.attempts);
	}
	public async recordStage({
		inspection,
		session,
		scorecard,
		readManifest,
		clock,
	}: PipelineStageRecord): Promise<void> {
		const { repPaths, repStart } = this.scope;
		const { now } = this.scope.runtime;
		const stageFile = repPaths.stageFile(inspection.definition.name);

		await Bun.write(
			stageFile,
			stageRecordJson({ json: JSON.stringify({ ...scorecard, readManifest }) }),
		);

		this.stages.push({
			elapsedMs: now() - (clock.read() ?? repStart),
			evidence: {
				recordFile: relative(repPaths.directory, stageFile),
				resultSha: session.resultSha,
			},
			grade: scorecard.grade.grade,
			stage: inspection.definition.name,
			status: "JUDGED",
			verdict: scorecard.grade.verdict,
		});
		this.result = session.resultSha;
	}
	public stopAfter({ definition, index }: PipelineStageInspection): void {
		for (const later of this.scope.context.request.pipeline.stages.slice(
			index + NEXT_SEQUENCE_ELEMENT_OFFSET,
		)) {
			this.stages.push({
				reason: `${definition.name} Judge stopped the rep`,
				stage: later.name,
				status: "NOT_REACHED",
			});
		}
	}
	public advance(session: StageSessionResult): void {
		this.baseline = session.resultSha;
		if (session.artifact !== undefined) {
			this.artifacts.push(session.artifact);
		}
		if (session.buildEvidence !== undefined) {
			this.build = session.buildEvidence;
		}
	}
	public checkpointRecorded(
		lineage: PipelineRepScope["context"]["frozen"]["initialCheckpoint"]["lineage"],
	): void {
		this.lineage = lineage;
	}
}
export { PipelineRepEvidence as default };
