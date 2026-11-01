import { lineageKey } from "./checkpoint";
import type { StageScorecard } from "./contracts";
import type { ReadManifestEntry } from "./read-manifest";
import type { ReplayExecutionContext, ReplayOutcome } from "./replay-contract";
import type { PreparedReplayStage } from "./replay-preparation";
import type { ReplayRecord } from "./replay-record";
import { runNameFromTimestamp } from "./run-layout";
import { bindReplay } from "./short-id";
import stageRecordJson from "./stage-record-json";
import type { StageSessionResult } from "./stage-session-contract";

const EMPTY_COLLECTION_LENGTH = 0;
interface GradedReplayStage {
	readonly session: StageSessionResult;
	readonly scorecard: StageScorecard;
	readonly readManifest: readonly ReadManifestEntry[];
	readonly elapsedMs: number;
}
class ReplayRecording {
	readonly #context: ReplayExecutionContext;
	readonly #prepared: PreparedReplayStage;
	public constructor(
		context: ReplayExecutionContext,
		prepared: PreparedReplayStage,
	) {
		this.#context = context;
		this.#prepared = prepared;
	}
	public async save(graded: GradedReplayStage): Promise<ReplayOutcome> {
		const {
			request,
			inputs: { plan, shortId },
		} = this.#context;
		const timestamp = new Date().toISOString();
		const record = this.record(graded, timestamp);
		const recordPath = request.paths.replayRecordFile(
			plan.consumed.lineage,
			timestamp,
		);
		await bindReplay(request.paths.runsDirectory, shortId, {
			lineage: plan.consumed.lineage,
			timestamp: runNameFromTimestamp(timestamp),
		});
		await Bun.write(
			recordPath,
			stageRecordJson({ json: JSON.stringify(record), kind: "replay" }),
		);

		return { record, recordPath };
	}
	private record(graded: GradedReplayStage, timestamp: string): ReplayRecord {
		const {
			request,
			inputs: { plan },
		} = this.#context;
		const { baselineSha: baseSha, staleness, productOwner } = this.#prepared;
		const { session, scorecard, readManifest, elapsedMs } = graded;

		return {
			baseSha,
			consumed: {
				lineage: plan.consumed.lineage,
				stage: plan.consumed.stage,
				targetSha: plan.consumed.targetSha,
			},
			controlSha: request.controlSha,
			corpusFiles: session.corpusFiles,
			corpusVersion: session.corpusVersion,
			effort: request.effort,
			elapsedMs,
			judgeContractSha256: scorecard.judgeContractSha256,
			judgeCostUsd: scorecard.costUsd,
			judgeEffort: request.judgeEffort,
			judgeModel: request.judgeModel,
			lineage: lineageKey({
				corpusFiles: session.corpusFiles,
				effort: request.effort,
				model: request.model,
				settingsFile: request.loadedSettings?.hashed,
				upstream: plan.consumed.lineage,
			}),
			model: request.model,
			productOwnerCostUsd: productOwner.snapshot().spentUsd,
			readManifest,
			replay: true,
			resultSha: session.buildEvidence?.resultSha,
			runName: request.paths.name,
			scorecard,
			sessionBudgetUsd: request.sessionBudgetUsd,
			settingsFile: request.loadedSettings?.hashed,
			spendCeilingUsd: request.spendCeilingUsd,
			stage: request.stage,
			stageCostUsd: session.transcript.costUsd,
			stale: staleness.length > EMPTY_COLLECTION_LENGTH,
			staleness: staleness.map(({ stage, causes }) => ({ causes, stage })),
			timestamp,
		};
	}
}
export default ReplayRecording;
export type { GradedReplayStage };
