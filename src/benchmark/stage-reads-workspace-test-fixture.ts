import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { projectSlug } from "./session-capture";
import type { TestResources } from "./test-support";

function readLine(path: string): string {
	return JSON.stringify({
		message: {
			content: [
				{ id: "t", input: { file_path: path }, name: "Read", type: "tool_use" },
			],
		},
		type: "assistant",
	});
}
class StageReadsWorkspace {
	readonly #resources: Readonly<Pick<TestResources, "track">>;
	public constructor(resources: Readonly<Pick<TestResources, "track">>) {
		this.#resources = resources;
	}
	public async temporaryRoot(prefix: string): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), prefix));
		this.#resources.track(root);

		return root;
	}
	public async transcriptOf(
		targetDirectory: string,
		paths: readonly string[],
	): Promise<string> {
		const projectsDirectory = await mkdtemp(
			join(tmpdir(), "rehearse-projects-"),
		);
		this.#resources.track(projectsDirectory);
		const slug = join(projectsDirectory, projectSlug(targetDirectory));
		await mkdir(slug, { recursive: true });
		await Bun.write(
			join(slug, "session.jsonl"),
			paths.map((path) => readLine(path)).join("\n"),
		);

		return projectsDirectory;
	}
}
export { StageReadsWorkspace as default };
