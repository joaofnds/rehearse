import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function withJudgeDirectory<Value>(
	prefix: string,
	execute: (directory: string) => Promise<Value>,
): Promise<Value> {
	const directory = await mkdtemp(join(tmpdir(), prefix));
	try {
		return await execute(directory);
	} finally {
		await rm(directory, { force: true, recursive: true });
	}
}

export { withJudgeDirectory as default };
