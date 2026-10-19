import type PipelineRepEvidence from "./pipeline-rep-evidence";
import type {
	PipelineRepResources,
	PipelineRepScope,
	PipelineStageInspection,
} from "./pipeline-rep-execution";
import type PipelineRepProgress from "./pipeline-rep-progress";

interface PipelineRepExecutionState {
	readonly scope: PipelineRepScope;
	readonly progress: Readonly<PipelineRepProgress>;
	readonly evidence: Readonly<PipelineRepEvidence>;
}
interface PreparedPipelineRep extends PipelineRepExecutionState {
	readonly resources: PipelineRepResources;
}
interface PipelineStageExecution extends PreparedPipelineRep {
	readonly inspection: PipelineStageInspection;
}
export type {
	PipelineRepExecutionState,
	PreparedPipelineRep,
	PipelineStageExecution,
};
