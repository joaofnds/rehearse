import type { seedTaskBoard } from "./backlog";
import type { PipelineConfirmationGrading } from "./pipeline-confirmation-grading-port";
import type { PipelineConfirmationWorkspace } from "./pipeline-confirmation-workspace-port";
import type { StageSessionDependencies } from "./stage-session-dependencies";
import type { createProductOwner } from "./workflow";

interface PipelineConfirmationDependencies
	extends PipelineConfirmationWorkspace, PipelineConfirmationGrading {
	readonly stageSession: StageSessionDependencies;
	readonly createProductOwner: typeof createProductOwner;
	readonly seedTaskBoard: typeof seedTaskBoard;
}
export type { PipelineConfirmationDependencies };
