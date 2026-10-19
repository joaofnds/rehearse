import type { PipelineConfirmationDependencies } from "./pipeline-confirmation-dependencies";
import type { PipelineConfirmationRequest } from "./pipeline-confirmation-request";
import type { confirmationGroupPaths } from "./run-layout";

interface PipelineConfirmationExecution {
	readonly dependencies: PipelineConfirmationDependencies;
	readonly request: PipelineConfirmationRequest;
	readonly paths: ReturnType<typeof confirmationGroupPaths>;
	readonly worktreesDirectory: string;
	readonly now: () => number;
}
export type { PipelineConfirmationExecution };
