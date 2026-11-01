import type { ProviderCall, StageScorecard } from "./contracts";
import { operatorStopRecord } from "./operator-stop";
import { fileRunArtifactPersistence } from "./run-abort-artifact-records";
import type {
	CeilingStop,
	OperatorStop,
	PendingStage,
	RunArtifactPersistence,
	StoppedStageReadings,
} from "./run-abort-contracts";
import stageRecordJson from "./stage-record-json";
import type { ProductOwnerSnapshot } from "./workflow";

async function writeStageJudgeFailure(
	pending: PendingStage,
	reason: string,
	persistence: RunArtifactPersistence = fileRunArtifactPersistence,
): Promise<void> {
	const findings = scorecardReadings(pending.scorecard);
	const stopped = stoppedReadings(pending.stopped);
	const productOwner = productOwnerReadings(pending.productOwner);

	await persistence.write(
		pending.file,
		stageRecordJson({
			json: JSON.stringify({
				corpusFiles: pending.corpusFiles,
				corpusVersion: pending.corpusVersion,
				effort: pending.effort,
				error: reason,
				input: pending.input,
				judgeContractSha256: pending.judgeContractSha256,
				judgeEffort: pending.judgeEffort,
				judgeModel: pending.judgeModel,
				model: pending.model,
				readManifest: pending.readManifest,
				sessionBudgetUsd: pending.sessionBudgetUsd,
				stage: pending.stage,
				status: "STAGE_JUDGE_FAILED",
				...findings,
				...stopped,
				...productOwner,
				...pending.failure,
				ceilingStop: pending.ceilingStop,
				operatorStop: pending.operatorStop,
			}),
			kind: pending.scorecard === undefined ? "failed" : "stopped",
		}),
	);
}

function productOwnerReadings(productOwner: ProductOwnerSnapshot | undefined):
	| {
			readonly productOwnerCostUsd: number;
			readonly productOwnerProviderCalls: readonly ProviderCall[];
	  }
	| undefined {
	return productOwner === undefined
		? undefined
		: {
				productOwnerCostUsd: productOwner.spentUsd,
				productOwnerProviderCalls: productOwner.providerCalls,
			};
}

async function writeCeilingStop(
	stop: CeilingStop,
	reason: string,
	persistence: RunArtifactPersistence,
): Promise<void> {
	const productOwner = productOwnerReadings(stop.productOwner);
	await persistence.write(
		stop.file,
		stageRecordJson({
			json: JSON.stringify({
				error: reason,
				session: stop.session,
				stage: stop.stage,
				status: "STAGE_JUDGE_FAILED",
				...productOwner,
				ceilingStop: { ceilingUsd: stop.ceilingUsd, spentUsd: stop.spentUsd },
			}),
			kind: "ceiling",
		}),
	);
}

async function writeOperatorStop(
	file: string,
	stop: OperatorStop,
	persistence: RunArtifactPersistence,
): Promise<void> {
	await persistence.write(file, operatorStopRecord(stop.signal));
}

type ScorecardReadings = Pick<
	StageScorecard,
	"attempts" | "costUsd" | "judgeContractSha256"
> &
	Pick<
		StageScorecard["grade"],
		"dimensions" | "hardBlockers" | "requirements" | "summary"
	> & { readonly grade: Pick<StageScorecard["grade"], "grade" | "verdict"> };

function scorecardReadings(
	scorecard: StageScorecard | undefined,
): ScorecardReadings | undefined {
	return scorecard
		? {
				attempts: scorecard.attempts,
				costUsd: scorecard.costUsd,
				dimensions: scorecard.grade.dimensions,
				grade: {
					grade: scorecard.grade.grade,
					verdict: scorecard.grade.verdict,
				},
				hardBlockers: scorecard.grade.hardBlockers,
				judgeContractSha256: scorecard.judgeContractSha256,
				requirements: scorecard.grade.requirements,
				summary: scorecard.grade.summary,
			}
		: undefined;
}

function stoppedReadings(
	stopped: StoppedStageReadings | undefined,
): StoppedStageReadings | undefined {
	return stopped === undefined
		? undefined
		: {
				elapsedMs: stopped.elapsedMs,
				minimumGrade: stopped.minimumGrade,
				runElapsedMs: stopped.runElapsedMs,
			};
}

export { writeStageJudgeFailure, writeCeilingStop, writeOperatorStop };
