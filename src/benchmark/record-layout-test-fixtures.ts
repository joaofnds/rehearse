import { afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RESOURCE_DRAIN_START_INDEX = 0;

class RecordLayoutFixtures {
	private readonly roots: string[] = [];
	public static forEachTest(): RecordLayoutFixtures {
		const fixtures = new RecordLayoutFixtures();
		afterEach(async () => {
			await fixtures.cleanup();
		});
		return fixtures;
	}
	public async root(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-run-layout-"));
		this.roots.push(root);
		return root;
	}
	private async cleanup(): Promise<void> {
		await Promise.all(
			this.roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
				await rm(root, { force: true, recursive: true });
			}),
		);
	}
}
export { RecordLayoutFixtures as default };
