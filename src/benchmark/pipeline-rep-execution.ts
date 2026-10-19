import type { PipelineConfirmationDependencies } from "./pipeline-confirmation-dependencies";
import type { PipelineConfirmationRequest } from "./pipeline-confirmation-request";
import type {
	FrozenPipelineInputs,
	FrozenPipelineStage,
} from "./pipeline-frozen-inputs";
import type {
	ConfirmationRepPaths,
	confirmationGroupPaths,
} from "./run-layout";
import type { SpendCeiling } from "./spend-ceiling";
import type { ServiceEnvironment, TargetServices } from "./target-services";
import type { ProductOwner } from "./workflow";

interface PipelineRepPlan {
	readonly repId: string;
	readonly ordinal: number;
	readonly worktreePath: string;
}

interface PipelineRepContext {
	readonly request: PipelineConfirmationRequest;
	readonly frozen: FrozenPipelineInputs;
	readonly paths: ReturnType<typeof confirmationGroupPaths>;
	readonly plan: PipelineRepPlan;
}

interface PipelineRepRuntime {
	readonly now: () => number;
	readonly spendCeiling: SpendCeiling;
	readonly services: TargetServices;
}

interface PipelineRepScope {
	readonly dependencies: PipelineConfirmationDependencies;
	readonly context: PipelineRepContext;
	readonly runtime: PipelineRepRuntime;
	readonly repPaths: ConfirmationRepPaths;
	readonly repStart: number;
}
interface PipelineRepResources {
	readonly environment: ServiceEnvironment;
	readonly productOwner: ProductOwner;
}
interface PipelineStageInspection extends FrozenPipelineStage {
	readonly index: number;
}
export type {
	PipelineRepPlan,
	PipelineRepContext,
	PipelineRepRuntime,
	PipelineRepScope,
	PipelineRepResources,
	PipelineStageInspection,
};
