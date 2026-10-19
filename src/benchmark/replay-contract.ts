import type { CheckpointRecord, HashedFile } from "./checkpoint";
import type { Effort } from "./config";
import type { CorpusRoot } from "./corpus-file";
import type { StageDefinition } from "./pipeline";
import type { ReplayDependencies } from "./replay-dependencies";
import type ReplayLifetime from "./replay-lifetime";
import type { ReplayInputs } from "./replay-lineage";
import type { ReplayRecord } from "./replay-record";
import type { BenchmarkRunPaths } from "./run-layout";
import type { LoadedStageSettings } from "./stage-settings";

class ReplayError extends Error {
	public override name = "ReplayError";
}
interface ReplayPlan {
	readonly definition: StageDefinition;
	readonly consumed: CheckpointRecord;
	readonly priorArtifacts: readonly HashedFile[];
	/** The verified chain from the initial checkpoint to the consumed one. */
	readonly chain: readonly CheckpointRecord[];
}
interface ReplayRequest {
	readonly corpusSource: CorpusRoot;
	readonly paths: BenchmarkRunPaths;
	readonly stage: string;
	readonly instructions: string;
	readonly controlSha: string;
	readonly declaredTargetRoot: string | undefined;
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly judgeModel: string;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly spendCeilingUsd: number;
	readonly settingSources?: "project" | undefined;
	readonly loadedSettings?: LoadedStageSettings | undefined;
}
interface ReplayOutcome {
	readonly record: ReplayRecord;
	readonly recordPath: string;
}
interface ReplayExecutionContext {
	readonly dependencies: ReplayDependencies;
	readonly request: ReplayRequest;
	readonly inputs: ReplayInputs;
	readonly lifetime: ReplayLifetime;
}
export { ReplayError as default };
export type {
	ReplayPlan,
	ReplayRequest,
	ReplayOutcome,
	ReplayExecutionContext,
};
