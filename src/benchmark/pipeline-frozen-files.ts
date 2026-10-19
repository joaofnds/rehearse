import { join } from "node:path";

import { frozenDirectoryFiles, writeFrozenFile } from "./confirmation-evidence";
import type { FrozenFile } from "./confirmation-evidence";
import orderedJson from "./ordered-json";
import { pipelineValidationOrder } from "./pipeline";
import type { PipelineInputExecution } from "./pipeline-frozen-inputs";

interface FrozenInputDocument {
	readonly name: string;
	readonly content: string;
	readonly kind: FrozenFile["kind"];
}
interface PipelineFrozenDirectories {
	readonly checkpointDirectory: string;
	readonly corpusRoot: string;
}
class PipelineFrozenFiles {
	public constructor(private readonly execution: PipelineInputExecution) {}
	private async writeDocument(
		document: FrozenInputDocument,
	): Promise<FrozenFile> {
		return await writeFrozenFile(this.execution.directories.groupDirectory, {
			content: document.content,
			kind: document.kind,
			path: join(this.execution.directories.inputsDirectory, document.name),
		});
	}
	public async collect({
		checkpointDirectory,
		corpusRoot,
	}: PipelineFrozenDirectories): Promise<readonly FrozenFile[]> {
		const { request, directories } = this.execution;
		const files: FrozenFile[] = [
			...(await frozenDirectoryFiles(
				directories.groupDirectory,
				checkpointDirectory,
				"checkpoint",
			)),
			...(await frozenDirectoryFiles(
				directories.groupDirectory,
				corpusRoot,
				"corpus",
			)),
			await this.writeDocument({
				content: `${orderedJson({ json: JSON.stringify(request.pipeline), order: pipelineValidationOrder })}\n`,
				kind: "pipeline",
				name: "pipeline.json",
			}),
			await this.writeDocument({
				content: request.instructions,
				kind: "instructions",
				name: "instructions.md",
			}),
			await this.writeDocument({
				content: request.task,
				kind: "task",
				name: "task.md",
			}),
			await this.writeDocument({
				content: request.productBrief,
				kind: "product-brief",
				name: "product-brief.md",
			}),
			await this.writeDocument({
				content: request.finalRubric,
				kind: "rubric",
				name: "final-rubric.md",
			}),
		];

		return [...files, ...(await this.writeStageRubrics())];
	}
	private async writeStageRubrics(): Promise<readonly FrozenFile[]> {
		const { request } = this.execution;
		return await Array.fromAsync(request.pipeline.stages, async (stage) => {
			const source = request.stageRubrics[stage.name];
			if (source === undefined) {
				throw new Error(`No frozen rubric for ${stage.name}`);
			}

			return await this.writeDocument({
				content: source.content,
				kind: "rubric",
				name: `${stage.name}-rubric.json`,
			});
		});
	}
}
export { PipelineFrozenFiles as default };
