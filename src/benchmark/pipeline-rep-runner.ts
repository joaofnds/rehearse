import type { ConfirmationRepResult } from "./confirmation-evidence";
import { completePipelineRep } from "./pipeline-rep-completion";
import failPipelineRep from "./pipeline-rep-failure-context";
import judgePipelineRepCandidate from "./pipeline-rep-final-judgment";
import runPipelineStages from "./pipeline-rep-stages";
import type { PipelineRepExecutionState } from "./pipeline-rep-state";
import preparePipelineRep from "./pipeline-rep-workspace";

async function executePipelineRep(
	state: PipelineRepExecutionState,
): Promise<ConfirmationRepResult> {
	try {
		const execution = { ...state, resources: await preparePipelineRep(state) };
		const stopped = await runPipelineStages(execution);
		if (stopped !== undefined) {
			return stopped;
		}

		const finalJudge = await judgePipelineRepCandidate(execution);

		return await completePipelineRep(execution, finalJudge);
	} catch (error) {
		return await failPipelineRep(state, { cause: error });
	}
}
export { executePipelineRep as default };
