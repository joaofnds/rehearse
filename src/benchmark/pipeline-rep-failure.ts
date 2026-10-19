import type { ConfirmationRepRecord } from "./confirmation-record";
import type { Immutable, ProviderCall } from "./contracts";
import type { PipelineConfirmationDependencies } from "./pipeline-confirmation-dependencies";
import type { PipelineConfirmationRequest } from "./pipeline-confirmation-request";
import type { PipelineRepPlan } from "./pipeline-rep-execution";
import type { StageClock } from "./pipeline-stage-clock";
import type { ReadManifestEntry } from "./read-manifest";
import type { ConfirmationRepPaths } from "./run-layout";
import type { StageSessionResult } from "./stage-session-contract";
import type { ProductOwner } from "./workflow";

interface PipelineRepFailure {
	readonly dependencies: PipelineConfirmationDependencies;
	readonly request: PipelineConfirmationRequest;
	readonly repPaths: ConfirmationRepPaths;
	readonly plan: PipelineRepPlan;
	readonly now: () => number;
	readonly repStart: number;
	readonly stageOutcomes: Immutable<ConfirmationRepRecord["stages"]>;
	readonly workerCalls: readonly ProviderCall[];
	readonly stageJudgeCalls: readonly ProviderCall[];
	readonly resultSha: string;
	readonly worktreeCreated: boolean;
	readonly productOwner: ProductOwner | undefined;
	readonly currentStageIndex: number;
	readonly currentSession: StageSessionResult | undefined;
	readonly stageClock: StageClock;
	readonly judgingStage: boolean;
	readonly judgedReads: readonly ReadManifestEntry[];
	readonly judgingFinal: boolean;
	readonly setupOperation: string | undefined;
	readonly failure: Readonly<Error>;
}

export type { PipelineRepFailure };
