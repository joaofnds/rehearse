import { afterEach } from "bun:test";
import { mkdtemp, readdir, rename, rm, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand } from "./command";
import { STORED_GIT_DIRECTORY } from "./git-directory-name";
import type { LocalCheckResult } from "./contracts";
import type { TargetDefinition } from "./pipeline";
import { removeWorktree } from "./target";

export const PROJECT_ROOT = join(import.meta.dir, "../..");
export const AUDIT_LOG_CASE_DIR = "cases/audit-log";
export const AUDIT_LOG_PIPELINE_PATH = `${AUDIT_LOG_CASE_DIR}/pipelines/default.json`;
export const AUDIT_LOG_RUBRICS_PATH = `${AUDIT_LOG_CASE_DIR}/rubrics`;
export const TEST_TARGET: TargetDefinition = {
	checks: [{ command: ["bun", "--version"] }],
	integrityFiles: ["base.txt"],
};

export interface TestRepository {
	readonly directory: string;
	readonly sha: string;
}

interface TrackedWorktree {
	readonly repositoryRoot: string;
	readonly path: string;
}

/**
 * A target keeps its board, its agent state, and its dependencies out of the
 * tree the harness measures, so a fixture repository that tracked them would
 * read as dirty the moment a test wrote one.
 */
export const WORKFLOW_STATE_IGNORES =
	"backlog/\n.boris/\n.claude/\nnode_modules/\n";

export class TestResources {
	private readonly directories: string[] = [];
	private readonly worktrees: TrackedWorktree[] = [];

	public static forEachTest(): TestResources {
		const resources = new TestResources();
		afterEach(() => resources.cleanup());

		return resources;
	}

	public track(directory: string): void {
		this.directories.push(directory);
	}

	/**
	 * A worktree removed only by the test's last statement leaks whenever an
	 * earlier assertion fails, and it leaks into the repository's metadata,
	 * which removing the directory does not undo.
	 */
	public trackWorktree(repositoryRoot: string, path: string): void {
		this.worktrees.push({ repositoryRoot, path });
	}

	/**
	 * `loadPipeline` refuses a definition outside the control repository, so a
	 * test pipeline has to live under it. Tracking the directory before it holds
	 * anything is what keeps an interrupted run from leaving a stray file that
	 * `assertControlReady` would then refuse every run over.
	 */
	public async createControlDirectory(): Promise<string> {
		const directory = await mkdtemp(join(PROJECT_ROOT, "rehearse-test-"));
		this.track(directory);

		return directory;
	}

	public async createRepository(): Promise<TestRepository> {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-source-"));
		this.track(directory);
		await runCommand(["git", "init", "-b", "main"], directory);
		await runCommand(
			["git", "config", "user.name", "Benchmark Test"],
			directory,
		);
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
		const head = await runCommand(["git", "rev-parse", "HEAD"], directory);

		return { directory, sha: head.trim() };
	}

	private async cleanup(): Promise<void> {
		await Promise.all(
			this.worktrees
				.splice(0)
				.map(({ repositoryRoot, path }) =>
					removeWorktree(repositoryRoot, path).catch(() => undefined),
				),
		);
		await Promise.all(
			this.directories
				.splice(0)
				.map((path) => rm(path, { force: true, recursive: true })),
		);
	}
}

export async function commitAll(
	directory: string,
	message: string,
): Promise<void> {
	await runCommand(["git", "add", "."], directory);
	await runCommand(["git", "commit", "-m", message], directory);
}

export interface HistoryFixture {
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
export async function historyFixture(
	subjects: readonly string[],
	options: { readonly packed?: boolean } = {},
): Promise<HistoryFixture> {
	const path = await mkdtemp(join(tmpdir(), "rehearse-history-fixture-"));
	await runCommand(["git", "init", "--initial-branch=main"], path);
	await runCommand(["git", "config", "user.name", "Fixture Author"], path);
	await runCommand(
		["git", "config", "user.email", "fixture@example.com"],
		path,
	);

	const commits: string[] = [];
	for (const subject of subjects) {
		await Bun.write(join(path, `${subject}.md`), `${subject}\n`);
		await commitAll(path, subject);
		const head = await runCommand(["git", "rev-parse", "HEAD"], path);
		commits.push(head.trim());
	}
	if (options.packed === true) {
		await runCommand(["git", "pack-refs", "--all"], path);
	}

	await rename(join(path, ".git"), join(path, STORED_GIT_DIRECTORY));
	await rm(join(path, STORED_GIT_DIRECTORY, "hooks"), {
		force: true,
		recursive: true,
	});
	await dropEmptyDirectories(join(path, STORED_GIT_DIRECTORY));

	return { path, commits };
}

async function dropEmptyDirectories(root: string): Promise<void> {
	const entries = await readdir(root, { withFileTypes: true });

	for (const entry of entries) {
		if (entry.isDirectory()) {
			await dropEmptyDirectories(join(root, entry.name));
		}
	}

	const remaining = await readdir(root);
	if (remaining.length === 0) {
		await rmdir(root);
	}
}

export function harnessResult(
	status: "PASS" | "FAIL",
	claim: string,
): LocalCheckResult {
	return {
		status,
		evidence: [
			{
				source: "local-checks",
				path: "harness",
				claim,
			},
		],
	};
}
