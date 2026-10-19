import { mkdir, mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PipelineConfirmationDependencies } from "./pipeline-confirmation";
import { projectSlug } from "./session-capture";

interface TranscriptResources {
	readonly track: (directory: string) => void;
}

interface TranscriptLocation {
	readonly projectsDirectory: string;
}

class PipelineTranscriptFixture {
	private readonly projectsDirectory: string;
	private constructor(location: TranscriptLocation) {
		this.projectsDirectory = location.projectsDirectory;
	}

	public static async setup(
		resources: TranscriptResources,
	): Promise<PipelineTranscriptFixture> {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-projects-"));
		resources.track(directory);

		return new PipelineTranscriptFixture({ projectsDirectory: directory });
	}

	public readonly override = (
		dependencies: PipelineConfirmationDependencies,
	): PipelineConfirmationDependencies => ({
		...dependencies,
		projectsDirectory: this.projectsDirectory,
		stageSession: {
			...dependencies.stageSession,
			runWorkflowStage: async (request) => {
				const slug = join(
					this.projectsDirectory,
					projectSlug(await realpath(request.targetDir)),
				);
				await mkdir(slug, { recursive: true });
				await Bun.write(
					join(slug, `${request.stage}.jsonl`),
					JSON.stringify({
						message: {
							content: [
								{
									id: "t",
									input: {
										file_path: join(
											request.targetDir,
											`.claude/skills/${request.stage}/SKILL.md`,
										),
									},
									name: "Read",
									type: "tool_use",
								},
							],
						},
						type: "assistant",
					}),
				);

				return await dependencies.stageSession.runWorkflowStage(request);
			},
		},
	});
}

export { PipelineTranscriptFixture as default };
