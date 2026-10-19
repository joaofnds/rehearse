import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCommand } from "./command";
import type { TestRepository, TestResources } from "./test-support";

const BACKLOG_TASK_SEED =
	"# Add an audit log\n\nRecord every write to the ledger.\n";

async function createBacklogTarget(
	resources: Readonly<TestResources>,
): Promise<TestRepository> {
	const target = await resources.createRepository();
	await runCommand(
		["git", "config", "core.excludesFile", "/dev/null"],
		target.directory,
	);
	return target;
}

async function removeBoardIgnores(targetDir: string): Promise<void> {
	await Bun.write(join(targetDir, ".gitignore"), "node_modules/\n");
	await runCommand(["git", "add", ".gitignore"], targetDir);
	await runCommand(
		["git", "commit", "-m", "chore: drop workflow ignores"],
		targetDir,
	);
}

async function createLinkedBacklogWorktree(
	resources: Readonly<TestResources>,
	targetDir: string,
): Promise<string> {
	await runCommand(["git", "switch", "-c", "primary"], targetDir);
	const parent = await mkdtemp(join(tmpdir(), "rehearse-worktree-"));
	resources.track(parent);
	const worktree = join(parent, "main");
	await runCommand(["git", "worktree", "add", worktree, "main"], targetDir);
	resources.trackWorktree(targetDir, worktree);
	return worktree;
}

export {
	BACKLOG_TASK_SEED,
	createBacklogTarget,
	removeBoardIgnores,
	createLinkedBacklogWorktree,
};
