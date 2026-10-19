import type { ConfirmationRepPlan } from "./confirmation";
import type { Immutable } from "./contracts";
import type { ReplayDependencies } from "./replay";
import type { ReplayConfirmationRequest } from "./replay-confirmation-contract";
import type { FrozenReplayInputs } from "./replay-confirmation-inputs";
import type { confirmationGroupPaths } from "./run-layout";
import type { SpendCeiling } from "./spend-ceiling";
import type { TargetServices } from "./target-services";

interface ReplayRepInput {
	readonly dependencies: ReplayDependencies;
	readonly request: ReplayConfirmationRequest;
	readonly runtime: ReplayConfirmationRuntime;
	readonly repSpendCeiling: () => SpendCeiling;
}
interface ReplayRepContext extends ReplayRepInput {
	readonly plan: ConfirmationRepPlan<Immutable<FrozenReplayInputs>>;
	readonly services: TargetServices;
	readonly paths: ReturnType<ReplayConfirmationRuntime["paths"]["rep"]>;
	readonly repStart: number;
	readonly spendCeiling: SpendCeiling;
}
interface ReplayConfirmationRuntime {
	readonly paths: ReturnType<typeof confirmationGroupPaths>;
	readonly frozen: Immutable<FrozenReplayInputs>;
	readonly worktreesDirectory: string;
	readonly now: () => number;
}
export type { ReplayConfirmationRuntime, ReplayRepInput, ReplayRepContext };
