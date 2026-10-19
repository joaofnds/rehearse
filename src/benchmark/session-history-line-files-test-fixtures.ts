import { afterEach } from "bun:test";
import { mkdtemp, open, rm } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RESOURCE_DRAIN_START_INDEX = 0;

class HistoryLineFiles {
	private readonly openHandles: FileHandle[] = [];
	private readonly roots: string[] = [];
	public static forEachTest(): HistoryLineFiles {
		const files = new HistoryLineFiles();
		afterEach(async () => {
			await files.cleanup();
		});
		return files;
	}
	public async linesOf(contents: string): Promise<AsyncIterable<string>> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-series-lines-"));
		this.roots.push(root);
		const path = join(root, "transcript.jsonl");
		await Bun.write(path, contents);
		const handle = await open(path);
		this.openHandles.push(handle);
		return handle.readLines({ autoClose: false });
	}
	private async cleanup(): Promise<void> {
		await Array.fromAsync(
			this.openHandles.splice(RESOURCE_DRAIN_START_INDEX),
			async (handle) => {
				await handle.close();
			},
		);
		await Promise.all(
			this.roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
				await rm(root, { force: true, recursive: true });
			}),
		);
	}
}

export { HistoryLineFiles as default };
