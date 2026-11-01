import type { Immutable, StageScorecard } from "./contracts";
import type { JudgeOutputValidationError } from "./judge-attempt";
import type { ReadManifestEntry } from "./read-manifest";
import { RECORD_JSON_INDENT_SPACES } from "./replay-confirmation-rep-record";
import type { ReplayRepContext } from "./replay-confirmation-runtime";
import stageRecordJson from "./stage-record-json";

interface CompletedReplayStageRecord {
	readonly scorecard: StageScorecard;
	readonly readManifest: readonly ReadManifestEntry[];
}
async function writeCompletedReplayStage(
	repPaths: Readonly<ReplayRepContext["paths"]>,
	stage: string,
	{
		scorecard,
		readManifest: judgedReads,
	}: Immutable<CompletedReplayStageRecord>,
): Promise<string> {
	const scorecardFile = repPaths.stageFile(stage);
	await Bun.write(
		scorecardFile,
		stageRecordJson({
			json: JSON.stringify({ ...scorecard, readManifest: judgedReads }),
		}),
	);

	return scorecardFile;
}
interface RejectedReplayStageRecord {
	readonly failure: Readonly<JudgeOutputValidationError>;
	readonly readManifest: readonly ReadManifestEntry[];
}
async function writeRejectedReplayStage(
	repPaths: Readonly<ReplayRepContext["paths"]>,
	stage: string,
	{ failure, readManifest: judgedReads }: Immutable<RejectedReplayStageRecord>,
): Promise<string> {
	const scorecardFile = repPaths.stageFile(stage);
	await Bun.write(
		scorecardFile,
		`${JSON.stringify(
			{
				attempts: failure.attempts,
				costUsd: failure.costUsd,
				error: failure.message,
				judgeContractSha256: failure.judgeContractSha256,
				prompt: failure.prompt,
				readManifest: judgedReads,
				stage,
				status: "REJECTED",
			},
			null,
			RECORD_JSON_INDENT_SPACES,
		)}\n`,
	);

	return scorecardFile;
}
export { writeCompletedReplayStage, writeRejectedReplayStage };

export type { CompletedReplayStageRecord, RejectedReplayStageRecord };
