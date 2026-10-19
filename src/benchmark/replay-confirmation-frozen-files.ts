import { join } from "node:path";

import type { FrozenFile } from "./confirmation-evidence";
import { frozenDirectoryFiles, writeFrozenFile } from "./confirmation-evidence";
import type { Immutable } from "./contracts";
import orderedJson from "./ordered-json";
import { pipelineValidationOrder } from "./pipeline";
import type { ReplayConfirmationRequest } from "./replay-confirmation-contract";
import type {
	FrozenReplayInputs,
	ReplayInputDirectories,
	ReplayLineage,
} from "./replay-confirmation-inputs";

interface ReplayFrozenFilesInput {
	readonly directories: ReplayInputDirectories;
	readonly lineage: ReplayLineage;
	readonly corpusRoot: string;
	readonly rubric: FrozenReplayInputs["rubric"];
	readonly request: ReplayConfirmationRequest;
}
async function writeReplayFrozenFiles({
	directories: { groupDirectory, inputsDirectory },
	lineage: { manifest, checkpointDirectory },
	corpusRoot,
	rubric,
	request,
}: Immutable<ReplayFrozenFilesInput>): Promise<readonly FrozenFile[]> {
	return [
		...(await frozenDirectoryFiles(
			groupDirectory,
			checkpointDirectory,
			"checkpoint",
		)),
		...(await frozenDirectoryFiles(groupDirectory, corpusRoot, "corpus")),
		await writeFrozenFile(groupDirectory, {
			content: rubric.content,
			kind: "rubric",
			path: join(inputsDirectory, "rubric.json"),
		}),
		await writeFrozenFile(groupDirectory, {
			content: request.instructions,
			kind: "instructions",
			path: join(inputsDirectory, "instructions.md"),
		}),
		await writeFrozenFile(groupDirectory, {
			content: `${orderedJson({ json: JSON.stringify(manifest.pipeline), order: pipelineValidationOrder })}\n`,
			kind: "pipeline",
			path: join(inputsDirectory, "pipeline.json"),
		}),
		await writeFrozenFile(groupDirectory, {
			content: manifest.task,
			kind: "task",
			path: join(inputsDirectory, "task.md"),
		}),
		await writeFrozenFile(groupDirectory, {
			content: manifest.productBrief,
			kind: "product-brief",
			path: join(inputsDirectory, "product-brief.md"),
		}),
	];
}
export default writeReplayFrozenFiles;
