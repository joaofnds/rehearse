import { mkdir, mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ReplayDependencyOverride } from "./replay-confirmation-test-support";
import { projectSlug } from "./session-capture";
import type { TestResources } from "./test-support";

class ReplayTranscriptRecorder {
	public constructor(public readonly projectsDirectory: string) {}
	public static async create(
		resources: Pick<TestResources, "track">,
	): Promise<ReplayTranscriptRecorder> {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-projects-"));
		resources.track(directory);

		return new ReplayTranscriptRecorder(directory);
	}
	public readonly override: ReplayDependencyOverride = (defaults) => ({
		...defaults,
		projectsDirectory: this.projectsDirectory,
		stageSession: {
			...defaults.stageSession,
			runWorkflowStage: async (options) => {
				const slug = join(
					this.projectsDirectory,
					projectSlug(await realpath(options.targetDir)),
				);
				await mkdir(slug, { recursive: true });
				await Bun.write(
					join(slug, "session.jsonl"),
					JSON.stringify({
						message: {
							content: [
								{
									id: "t",
									input: {
										file_path: "/live/skills/build/SKILL.md",
									},
									name: "Read",
									type: "tool_use",
								},
							],
						},
						type: "assistant",
					}),
				);

				return await defaults.stageSession.runWorkflowStage(options);
			},
		},
	});
}
export default ReplayTranscriptRecorder;
