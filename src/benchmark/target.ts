import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { z } from "zod";
import { existingBacklogLayout } from "./backlog-layout";
import { captureBoundedContent } from "./checks";
import { CommandError, runCommand } from "./command";
import { CONTROL_DIR } from "./config";
import { StageValidationError } from "./contracts";
import { RefusedPreconditionError } from "./exit-codes";
import type { WorkflowPath } from "./workflow-state";
import {
	copyWorkflowState,
	managedWorkflowPaths,
	replaceWorkflowState,
} from "./workflow-state";

export interface SourceBaseline {
	readonly root: string;
	readonly sha: string;
	readonly origin?: string | undefined;
}

export interface WorkflowBackup {
	readonly directory: string;
	readonly managedPaths: readonly WorkflowPath[];
	readonly presentPaths: readonly WorkflowPath[];
}

export async function git(
	directory: string,
	...args: readonly string[]
): Promise<string> {
	const output = await runCommand(["git", ...args], directory);
	return output.trim();
}

/**
 * The commit a checkout is on. A stage's changes are measured against it, and
 * a replay's worktree starts there because the harness adds no commit of its
 * own before the session runs.
 */
export function currentSha(directory: string): Promise<string> {
	return git(directory, "rev-parse", "HEAD");
}

export async function assertSourceReady(
	sourceDir: string,
): Promise<SourceBaseline> {
	const sourceRoot = await realpath(sourceDir);
	const repositoryRoot = await realpath(
		await git(sourceRoot, "rev-parse", "--show-toplevel"),
	);
	const controlRoot = await realpath(CONTROL_DIR);

	if (sourceRoot !== repositoryRoot) {
		throw new Error("Target must be the repository root");
	}

	if (sourceRoot === controlRoot) {
		throw new Error("Target must not be the control repository");
	}

	const branch = await git(sourceRoot, "branch", "--show-current");
	if (branch !== "main") {
		throw new Error(
			`Target must be on main, found ${branch || "detached HEAD"}`,
		);
	}

	const status = await git(
		sourceRoot,
		"status",
		"--porcelain=v1",
		"--untracked-files=all",
	);
	if (status) {
		throw new Error("Target main must be clean before a run");
	}

	return {
		root: sourceRoot,
		sha: await git(sourceRoot, "rev-parse", "HEAD"),
		origin: await optionalGit(sourceRoot, "remote", "get-url", "origin"),
	};
}

async function optionalGit(
	directory: string,
	...args: readonly string[]
): Promise<string | undefined> {
	try {
		return await git(directory, ...args);
	} catch {
		return undefined;
	}
}

export async function assertControlReady(): Promise<string> {
	const status = await git(
		CONTROL_DIR,
		"status",
		"--porcelain=v1",
		"--untracked-files=all",
	);
	if (status) {
		throw new Error(
			"Commit the control repository before running the benchmark",
		);
	}

	return git(CONTROL_DIR, "rev-parse", "HEAD");
}

export async function captureWorkflowBackup(
	targetDir: string,
): Promise<WorkflowBackup> {
	await assertWorkflowBoardPrivate(targetDir);

	const directory = await mkdtemp(join(tmpdir(), "rehearse-workflow-backup-"));
	try {
		const managedPaths = await managedWorkflowPaths(targetDir);
		const presentPaths = await copyWorkflowState(
			targetDir,
			directory,
			managedPaths,
		);

		return { directory, managedPaths, presentPaths };
	} catch (error) {
		await rm(directory, { force: true, recursive: true });
		throw error;
	}
}

export async function assertWorkflowBoardPrivate(
	targetDir: string,
): Promise<void> {
	const layout = await existingBacklogLayout(targetDir);
	const configPath =
		layout === undefined ? undefined : relative(targetDir, layout.configPath);
	const trackedBoardFiles: string[] = [];

	for (const path of await managedWorkflowPaths(targetDir)) {
		if (path === "backlog.config.yml") {
			continue;
		}

		const tracked = await git(targetDir, "ls-files", "-z", "--", path);
		trackedBoardFiles.push(
			...tracked
				.split("\0")
				.filter(
					(trackedPath) => trackedPath !== "" && trackedPath !== configPath,
				),
		);
	}

	if (trackedBoardFiles.length > 0) {
		throw new RefusedPreconditionError(
			`Backlog workflow state must not contain tracked files: ${trackedBoardFiles.join(", ")}`,
		);
	}
}

async function runMarkerPath(root: string): Promise<string> {
	return join(
		await git(root, "rev-parse", "--absolute-git-dir"),
		"benchmark-run.json",
	);
}

const runMarkerSchema = z.object({
	sha: z.string().min(1),
	pid: z.number(),
	run: z.string().min(1).optional(),
	startedAt: z.iso.datetime(),
});

export type RunMarker = z.infer<typeof runMarkerSchema>;

/**
 * Undefined for a target nothing has claimed, or one already restored: both
 * read as "nothing to reconcile" to a caller reconciling crashed runs, not
 * as an error.
 */
export async function readRunMarker(
	root: string,
): Promise<RunMarker | undefined> {
	const marker = Bun.file(await runMarkerPath(root));
	if (!(await marker.exists())) {
		return undefined;
	}

	return runMarkerSchema.parse(JSON.parse(await marker.text()));
}

export async function claimTarget(
	source: SourceBaseline,
	run: string,
): Promise<void> {
	const path = await runMarkerPath(source.root);
	const marker = Bun.file(path);

	if (await marker.exists()) {
		const markerText = await marker.text();
		throw new Error(
			`A previous benchmark run left this target unrestored: ${markerText.trim()}. Restore it manually (git reset --hard <sha>; git clean -fd), then delete ${path}.`,
		);
	}

	await Bun.write(
		path,
		`${JSON.stringify({
			sha: source.sha,
			pid: process.pid,
			run,
			startedAt: new Date().toISOString(),
		})}\n`,
	);
}

export async function restoreTarget(
	source: SourceBaseline,
	backup?: WorkflowBackup,
): Promise<void> {
	await git(source.root, "switch", "--force", "main");
	await git(source.root, "reset", "--hard", source.sha);
	await git(source.root, "clean", "-fd");

	if (backup) {
		await replaceWorkflowState(
			backup.directory,
			source.root,
			backup.presentPaths,
			backup.managedPaths,
		);
	}

	const restored = await assertSourceReady(source.root);
	if (restored.sha !== source.sha) {
		throw new Error(
			"Target repository was not restored to its original commit",
		);
	}

	await rm(await runMarkerPath(source.root), { force: true });
}

export async function teardownTarget(
	source: SourceBaseline,
	backup: WorkflowBackup,
	log: (message: string) => void,
): Promise<void> {
	try {
		await restoreTarget(source, backup);
	} catch (error) {
		console.error(
			`Restore failed; the workflow backup remains at ${backup.directory}`,
		);
		throw error;
	}

	await rm(backup.directory, { force: true, recursive: true });
	log(`Target restored to ${source.sha}.`);
}

/**
 * Checkpointed commits must outlive the run: restoring main makes the task
 * and result commits unreachable, and only this ref then keeps gc from
 * pruning the history a later replay materializes. The ref is harness state
 * in the target's git directory, never part of the corpus.
 */
export async function recordRetentionRef(
	targetDir: string,
	runName: string,
	sha: string,
): Promise<void> {
	await git(targetDir, "update-ref", `refs/rehearse/${runName}`, sha);
}

/**
 * A run's stages work on main; a replay's stage works on the worktree's
 * detached HEAD. `null` expects the detached checkout, where
 * `branch --show-current` prints nothing.
 */
export type ExpectedBranch = string | null;

function describeBranchDrift(
	branch: string,
	expectedBranch: ExpectedBranch,
): string {
	const found = branch ? `branch ${branch}` : "a detached checkout";
	const expected = expectedBranch ?? "a detached checkout";

	return `Target is on ${found}, expected ${expected}`;
}

function describeDirtyWorktree(status: string): string {
	const paths = status.split("\n").map((line) => line.trim());

	return `Target worktree is dirty: ${paths.join(", ")}`;
}

export async function assertWorkspaceCleanAt(
	targetDir: string,
	expectedSha: string,
	expectedBranch: ExpectedBranch = "main",
): Promise<void> {
	const branch = await git(targetDir, "branch", "--show-current");
	const sha = await git(targetDir, "rev-parse", "HEAD");
	const status = await git(
		targetDir,
		"status",
		"--porcelain=v1",
		"--untracked-files=all",
	);

	if (branch !== (expectedBranch ?? "")) {
		throw new StageValidationError(describeBranchDrift(branch, expectedBranch));
	}

	if (sha !== expectedSha) {
		throw new StageValidationError(
			`Target is at commit ${sha}, expected ${expectedSha}`,
		);
	}

	if (status) {
		throw new StageValidationError(describeDirtyWorktree(status));
	}
}

export interface BuildCandidate {
	readonly resultSha: string;
	readonly diff: string;
	readonly changedPaths: readonly string[];
}

/**
 * A planning stage may commit workflow artifacts (a glossary, a document),
 * so an advanced HEAD is evidence, not a broken baseline. What it may not
 * do is leave the branch, leave the worktree dirty, or rewrite the history
 * it started from.
 */
export async function capturePlanningAdvance(
	targetDir: string,
	baselineSha: string,
	expectedBranch: ExpectedBranch = "main",
): Promise<{
	resultSha: string;
	diff: string;
	changedPaths: string[];
	commitSubjects?: string[] | undefined;
}> {
	const branch = await git(targetDir, "branch", "--show-current");
	const status = await git(
		targetDir,
		"status",
		"--porcelain=v1",
		"--untracked-files=all",
	);
	if (branch !== (expectedBranch ?? "")) {
		throw new StageValidationError(describeBranchDrift(branch, expectedBranch));
	}

	if (status !== "") {
		throw new StageValidationError(describeDirtyWorktree(status));
	}

	const resultSha = await git(targetDir, "rev-parse", "HEAD");
	if (resultSha === baselineSha) {
		return { resultSha, diff: "", changedPaths: [] };
	}

	try {
		await git(targetDir, "merge-base", "--is-ancestor", baselineSha, resultSha);
	} catch (error) {
		if (error instanceof CommandError && error.exitCode === 1) {
			throw new StageValidationError(
				"Planning stage rewrote or discarded task history",
			);
		}

		throw error;
	}

	return {
		resultSha,
		diff: await runCommand(
			["git", "diff", "--no-ext-diff", `${baselineSha}..${resultSha}`],
			targetDir,
		),
		changedPaths: await changedPathsBetween(targetDir, baselineSha, resultSha),
		commitSubjects: await commitSubjectsBetween(
			targetDir,
			baselineSha,
			resultSha,
		),
	};
}

export async function captureBuildCandidate(
	targetDir: string,
	taskSha: string,
): Promise<BuildCandidate> {
	const resultSha = await git(targetDir, "rev-parse", "HEAD");
	const trackedDiff = await runCommand(
		["git", "diff", "--no-ext-diff", taskSha],
		targetDir,
	);
	const trackedOutput = await git(targetDir, "diff", "--name-only", taskSha);
	const trackedPaths = trackedOutput.split("\n").filter(Boolean);
	const untrackedOutput = await runCommand(
		["git", "ls-files", "--others", "--exclude-standard", "-z"],
		targetDir,
	);
	const untrackedPaths = untrackedOutput.split("\0").filter(Boolean);
	const untrackedDiffs = await Promise.all(
		untrackedPaths.map(async (path) => {
			const content = await captureBoundedContent(
				Bun.file(join(targetDir, path)),
			);
			return `diff --git a/${path} b/${path}\nnew untracked file\n--- /dev/null\n+++ b/${path}\n@@ untracked file @@\n${content}`;
		}),
	);

	return {
		resultSha,
		diff: [trackedDiff, ...untrackedDiffs].filter(Boolean).join("\n"),
		changedPaths: [...new Set([...trackedPaths, ...untrackedPaths])],
	};
}

export async function assertBuildCommitted(
	targetDir: string,
	taskSha: string,
	expectedBranch: ExpectedBranch = "main",
	commitSubjectPattern?: string,
): Promise<{
	resultSha: string;
	diff: string;
	commitSubjects: string[];
}> {
	const branch = await git(targetDir, "branch", "--show-current");
	if (branch !== (expectedBranch ?? "")) {
		throw new StageValidationError(
			`Build phase left ${expectedBranch ?? "its detached checkout"}`,
		);
	}

	const status = await git(
		targetDir,
		"status",
		"--porcelain=v1",
		"--untracked-files=all",
	);
	if (status) {
		throw new StageValidationError(
			`Build phase left uncommitted changes:\n${status}`,
		);
	}

	const resultSha = await git(targetDir, "rev-parse", "HEAD");
	if (resultSha === taskSha) {
		throw new StageValidationError("Build phase did not create a commit");
	}

	try {
		await git(targetDir, "merge-base", "--is-ancestor", taskSha, resultSha);
	} catch (error) {
		if (error instanceof CommandError && error.exitCode === 1) {
			throw new StageValidationError(
				"Build phase rewrote or discarded task history",
			);
		}

		throw error;
	}
	const diff = await runCommand(
		["git", "diff", "--no-ext-diff", `${taskSha}..${resultSha}`],
		targetDir,
	);
	if (!diff.trim()) {
		throw new StageValidationError("Build commit contains no changes");
	}

	const commitSubjects = await commitSubjectsBetween(
		targetDir,
		taskSha,
		resultSha,
	);
	if (commitSubjectPattern !== undefined) {
		assertCommitSubjects(commitSubjects, commitSubjectPattern);
	}

	return { resultSha, diff, commitSubjects };
}

async function commitSubjectsBetween(
	targetDir: string,
	baselineSha: string,
	resultSha: string,
): Promise<string[]> {
	const subjects = await git(
		targetDir,
		"log",
		"--reverse",
		"--format=%s",
		`${baselineSha}..${resultSha}`,
	);

	return subjects.split("\n");
}

export function assertCommitSubjects(
	subjects: readonly string[],
	pattern: string,
): void {
	const subjectPattern = new RegExp(pattern, "u");
	const invalidSubjects = subjects.filter(
		(subject) => !subjectPattern.test(subject),
	);

	if (invalidSubjects.length > 0) {
		throw new StageValidationError(
			`Build commit subjects do not match the pipeline's convention: ${invalidSubjects.join(", ")}`,
		);
	}
}

/**
 * Whether the target still holds a run's retained candidate. `rev-parse
 * --verify --quiet` exits 1 on a name that resolves to nothing, which is the
 * question, and 128 when it cannot read a repository there at all, which is
 * not: a repository that moved still holds the candidate, and its caller
 * should be sent looking for it rather than told to re-run.
 */
export async function refExists(
	repositoryRoot: string,
	reference: string,
): Promise<boolean> {
	try {
		await git(repositoryRoot, "rev-parse", "--verify", "--quiet", reference);

		return true;
	} catch (error) {
		if (error instanceof CommandError && error.exitCode === 1) {
			return false;
		}

		throw error;
	}
}

export async function addWorktree(
	repositoryRoot: string,
	committish: string,
	path: string,
): Promise<void> {
	await git(repositoryRoot, "worktree", "add", "--detach", path, committish);
}

// --force: a replay worktree holds untracked workflow state by design.
export async function removeWorktree(
	repositoryRoot: string,
	path: string,
): Promise<void> {
	await git(repositoryRoot, "worktree", "remove", "--force", path);
}

/** Forgets each worktree whose directory no longer exists. */
export async function pruneWorktrees(repositoryRoot: string): Promise<void> {
	await git(repositoryRoot, "worktree", "prune");
}

export async function changedPathsBetween(
	targetDir: string,
	fromSha: string,
	toSha: string,
): Promise<string[]> {
	const output = await git(
		targetDir,
		"diff",
		"--name-only",
		`${fromSha}..${toSha}`,
	);
	return output.split("\n").filter(Boolean);
}
