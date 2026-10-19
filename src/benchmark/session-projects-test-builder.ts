import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TestResources } from "./test-support";

interface SessionProjectsOptions {
	readonly names: readonly string[];
	readonly prefix: string;
}
class SessionProjectsBuilder {
	readonly #options: SessionProjectsOptions;
	public constructor(options: Partial<SessionProjectsOptions> = {}) {
		this.#options = {
			names: options.names ?? [],
			prefix: options.prefix ?? "rehearse-projects-",
		};
	}
	public async build(resources: Pick<TestResources, "track">): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), this.#options.prefix));
		resources.track(directory);
		await Array.fromAsync(
			this.#options.names.entries(),
			async ([index, name]) => {
				const slug = join(directory, `-private-tmp-project-${String(index)}`);
				await mkdir(slug, { recursive: true });
				await writeFile(
					join(slug, `${name}.jsonl`),
					`${JSON.stringify({ sessionId: name })}\n`,
				);
			},
		);

		return directory;
	}
}
export default SessionProjectsBuilder;
