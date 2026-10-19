import { CommandError, runCommand } from "./command";

const GIT_QUERY_NEGATIVE_EXIT_CODE = 1;

async function git(
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
async function currentSha(directory: string): Promise<string> {
	return await git(directory, "rev-parse", "HEAD");
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

/**
 * Checkpointed commits must outlive the run: no branch reaches the task and
 * result commits, so only this ref keeps gc from pruning the history a later
 * replay materializes. The ref is harness state, never part of the corpus.
 */
async function recordRetentionRef(
	targetDir: string,
	runName: string,
	sha: string,
): Promise<void> {
	await git(targetDir, "update-ref", retentionRef(runName), sha);
}

/** The ref that keeps a run's candidate and checkpoint commits reachable. */
function retentionRef(runName: string): string {
	return `refs/rehearse/${runName}`;
}

/**
 * Whether the target still holds a run's retained candidate. `rev-parse
 * --verify --quiet` exits 1 on a name that resolves to nothing, which is the
 * question, and 128 when it cannot read a repository there at all, which is
 * not: a repository that moved still holds the candidate, and its caller
 * should be sent looking for it rather than told to re-run.
 */
async function refExists(
	repositoryRoot: string,
	reference: string,
): Promise<boolean> {
	try {
		await git(repositoryRoot, "rev-parse", "--verify", "--quiet", reference);

		return true;
	} catch (error) {
		if (
			error instanceof CommandError &&
			error.exitCode === GIT_QUERY_NEGATIVE_EXIT_CODE
		) {
			return false;
		}

		throw error;
	}
}

async function addWorktree(
	repositoryRoot: string,
	committish: string,
	path: string,
): Promise<void> {
	await git(repositoryRoot, "worktree", "add", "--detach", path, committish);
}

async function removeWorktree(
	repositoryRoot: string,
	path: string,
): Promise<void> {
	await git(repositoryRoot, "worktree", "remove", "--force", path);
}

/** Forgets each worktree whose directory no longer exists. */
async function pruneWorktrees(repositoryRoot: string): Promise<void> {
	await git(repositoryRoot, "worktree", "prune");
}

async function changedPathsBetween(
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
export {
	git,
	currentSha,
	optionalGit,
	recordRetentionRef,
	retentionRef,
	refExists,
	addWorktree,
	removeWorktree,
	pruneWorktrees,
	changedPathsBetween,
	commitSubjectsBetween,
};
