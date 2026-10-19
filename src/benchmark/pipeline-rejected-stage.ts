import { relative } from "node:path";

import type { JudgeOutputValidationError } from "./judge-attempt";
import type { StageDefinition } from "./pipeline";
import type { PipelineRepFailure } from "./pipeline-rep-failure";

const RECORD_JSON_INDENT_SPACES = 2;
interface RejectedPipelineStage {
	readonly state: PipelineRepFailure;
	readonly judgeFailure: Readonly<JudgeOutputValidationError>;
	readonly stage: StageDefinition;
}
async function writeRejectedStage({
	state,
	judgeFailure,
	stage,
}: RejectedPipelineStage): Promise<{
	readonly resultSha: string;
	readonly recordFile: string;
}> {
	const { repPaths, failure, judgedReads, currentSession, resultSha } = state;
	const stageFile = repPaths.stageFile(stage.name);

	await Bun.write(
		stageFile,
		`${JSON.stringify({ attempts: judgeFailure.attempts, costUsd: judgeFailure.costUsd, error: failure.message, prompt: judgeFailure.prompt, readManifest: judgedReads, stage: stage.name, status: "REJECTED" }, null, RECORD_JSON_INDENT_SPACES)}\n`,
	);

	return {
		recordFile: relative(repPaths.directory, stageFile),
		resultSha: currentSession?.resultSha ?? resultSha,
	};
}
export { writeRejectedStage as default };
