import { afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCommand } from "./command";
import {
	historyFixture,
	initializeTestRepository,
} from "./repository-test-fixtures";
import type {
	HistoryFixture,
	TestRepository,
} from "./repository-test-fixtures";
import { removeWorktree } from "./target";

const RESOURCE_DRAIN_START_INDEX = 0;

const PROJECT_ROOT = join(import.meta.dir, "../..");

const AUDIT_LOG_CASE_DIR = "cases/audit-log";

const AUDIT_LOG_PIPELINE_PATH = `${AUDIT_LOG_CASE_DIR}/pipelines/default.json`;

const AUDIT_LOG_RUBRICS_PATH = `${AUDIT_LOG_CASE_DIR}/rubrics`;

interface TrackedWorktree {
	readonly repositoryRoot: string;
	readonly path: string;
}

class TestResources {
	private readonly directories: string[] = [];
	private readonly worktrees: TrackedWorktree[] = [];

	public static forEachTest(): TestResources {
		const resources = new TestResources();
		resources.registerCleanup();

		return resources;
	}

	public registerCleanup(): void {
		afterEach(async () => {
			await this.cleanup();
		});
	}

	public async createHistory(
		subjects: readonly string[],
		options: { readonly packed?: boolean } = {},
	): Promise<HistoryFixture> {
		const fixture = await historyFixture(subjects, options);
		this.track(fixture.path);

		return fixture;
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
		this.worktrees.push({ path, repositoryRoot });
	}

	public async createTemporaryDirectory(prefix: string): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), prefix));
		this.track(directory);

		return directory;
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
		await initializeTestRepository(directory);
		const head = await runCommand(["git", "rev-parse", "HEAD"], directory);

		return { directory, sha: head.trim() };
	}

	private async cleanup(): Promise<void> {
		await Promise.allSettled(
			this.worktrees
				.splice(RESOURCE_DRAIN_START_INDEX)
				.map(async ({ repositoryRoot, path }) => {
					await removeWorktree(repositoryRoot, path);
				}),
		);
		await Promise.all(
			this.directories.splice(RESOURCE_DRAIN_START_INDEX).map(async (path) => {
				await rm(path, { force: true, recursive: true });
			}),
		);
	}
}

export {
	PROJECT_ROOT,
	AUDIT_LOG_CASE_DIR,
	AUDIT_LOG_PIPELINE_PATH,
	AUDIT_LOG_RUBRICS_PATH,
	TestResources,
};
export {
	TEST_TARGET,
	WORKFLOW_STATE_IGNORES,
	commitAll,
	historyFixture,
} from "./repository-test-fixtures";
export {
	harnessResult,
	ampleSpendCeiling,
	judgeBudget,
	fakeRunAbortSignals,
	fakeRunEventRecorder,
} from "./runtime-test-fixtures";
export type {
	TestRepository,
	HistoryFixture,
} from "./repository-test-fixtures";

export { budgetHaltEnvelope, haltingCommand } from "./claude-test-fixtures";
