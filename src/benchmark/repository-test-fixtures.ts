import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rename, rm, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCommand } from "./command";
import STORED_GIT_DIRECTORY from "./git-directory-name";
import type { TargetDefinition } from "./pipeline";

const EMPTY_COLLECTION_LENGTH = 0;

const TEST_TARGET: TargetDefinition = {
	checks: [{ command: ["bun", "--version"] }],
	integrityFiles: ["base.txt"],
};

interface TestRepository {
	readonly directory: string;
	readonly sha: string;
}

/**
 * A target keeps its board, its agent state, and its dependencies out of the
 * tree the harness measures, so a fixture repository that tracked them would
 * read as dirty the moment a test wrote one.
 */
const WORKFLOW_STATE_IGNORES = "backlog/\n.boris/\n.claude/\nnode_modules/\n";

async function commitAll(directory: string, message: string): Promise<void> {
	await runCommand(["git", "add", "."], directory);
	await runCommand(["git", "commit", "-m", message], directory);
}

interface HistoryFixture {
	readonly path: string;
	readonly commits: readonly string[];
}

/**
 * A session case stores its committed history as a `dot-git` directory, and it
 * reaches a run as bytes git checked out. Building one in place is not the
 * same thing until the empty directories a commit drops are gone, so the
 * builder drops them: a fixture that kept them would hide the packed-refs
 * failure the seeding exists to prevent. The sample hooks `git init` writes go
 * too, because the seeding refuses a fixture carrying hooks at all.
 */
async function historyFixture(
	subjects: readonly string[],
	options: { readonly packed?: boolean } = {},
): Promise<HistoryFixture> {
	const path = await mkdtemp(join(tmpdir(), "rehearse-history-fixture-"));
	await initializeHistoryRepository(path);

	const commits: string[] = [];
	await Array.fromAsync(subjects, async (subject) => {
		await Bun.write(join(path, `${subject}.md`), `${subject}\n`);
		await commitAll(path, subject);
		const head = await runCommand(["git", "rev-parse", "HEAD"], path);
		commits.push(head.trim());
	});
	if (options.packed === true) {
		await runCommand(["git", "pack-refs", "--all"], path);
	}

	await rename(join(path, ".git"), join(path, STORED_GIT_DIRECTORY));
	await rm(join(path, STORED_GIT_DIRECTORY, "hooks"), {
		force: true,
		recursive: true,
	});
	await dropEmptyDirectories(join(path, STORED_GIT_DIRECTORY));

	return { commits, path };
}

async function dropEmptyDirectories(root: string): Promise<void> {
	const entries = await readdir(root, { withFileTypes: true });

	await Array.fromAsync(entries, async (entry) => {
		if (entry.isDirectory()) {
			await dropEmptyDirectories(join(root, entry.name));
		}
	});

	const remaining = await readdir(root);
	if (remaining.length === EMPTY_COLLECTION_LENGTH) {
		await rmdir(root);
	}
}

async function initializeTestRepository(directory: string): Promise<void> {
	await runCommand(["git", "init", "-b", "main"], directory);
	await runCommand(["git", "config", "user.name", "Benchmark Test"], directory);
	await runCommand(
		["git", "config", "user.email", "benchmark@example.com"],
		directory,
	);
	await Bun.write(join(directory, ".gitignore"), WORKFLOW_STATE_IGNORES);
	await Bun.write(join(directory, "base.txt"), "base\n");
	await Bun.write(
		join(directory, "package.json"),
		'{"scripts":{"typecheck":"tsc --noEmit","check":"biome check","test:unit":"bun test src"}}\n',
	);
	await Bun.write(join(directory, "bun.lock"), "{}\n");
	await commitAll(directory, "chore: base");
}
async function initializeHistoryRepository(path: string): Promise<void> {
	await runCommand(["git", "init", "--initial-branch=main"], path);
	await runCommand(["git", "config", "user.name", "Fixture Author"], path);
	await runCommand(
		["git", "config", "user.email", "fixture@example.com"],
		path,
	);
}

function uniqueGroupId(name: string): string {
	return `${name}-${randomUUID()}`;
}
async function temporaryDirectoriesWithPrefix(
	prefix: string,
): Promise<readonly string[]> {
	const entries = await readdir(tmpdir());
	return entries.filter((entry) => entry.startsWith(prefix));
}
export {
	temporaryDirectoriesWithPrefix,
	TEST_TARGET,
	uniqueGroupId,
	WORKFLOW_STATE_IGNORES,
	commitAll,
	historyFixture,
	initializeTestRepository,
};
export type { TestRepository, HistoryFixture };
