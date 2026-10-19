import { CommandError, runCommand } from "./command";
import { StageValidationError } from "./contracts";
import {
	changedPathsBetween,
	commitSubjectsBetween,
	git,
} from "./target-repository";

const EMPTY_COLLECTION_LENGTH = 0;

const GIT_QUERY_NEGATIVE_EXIT_CODE = 1;

/**
 * A run's stages work on main; a replay's stage works on the worktree's
 * detached HEAD. `null` expects the detached checkout, where
 * `branch --show-current` prints nothing.
 */
type ExpectedBranch = string | null;

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

async function assertWorkspaceCleanAt(
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

/**
 * A planning stage may commit workflow artifacts (a glossary, a document),
 * so an advanced HEAD is evidence, not a broken baseline. What it may not
 * do is leave the branch, leave the worktree dirty, or rewrite the history
 * it started from.
 */
async function capturePlanningAdvance(
	targetDir: string,
	baselineSha: string,
	expectedBranch: ExpectedBranch = "main",
): Promise<{
	resultSha: string;
	diff: string;
	changedPaths: string[];
	commitSubjects?: string[] | undefined;
}> {
	await assertPlanningWorkspace(targetDir, expectedBranch);

	const resultSha = await git(targetDir, "rev-parse", "HEAD");
	if (resultSha === baselineSha) {
		return { changedPaths: [], diff: "", resultSha };
	}

	await assertTaskHistory(
		{ baselineSha, resultSha, targetDir },
		"Planning stage rewrote or discarded task history",
	);

	const diff = await runCommand(
		["git", "diff", "--no-ext-diff", `${baselineSha}..${resultSha}`],
		targetDir,
	);
	const changedPaths = await changedPathsBetween(
		targetDir,
		baselineSha,
		resultSha,
	);
	const commitSubjects = await commitSubjectsBetween(
		targetDir,
		baselineSha,
		resultSha,
	);

	return {
		changedPaths,
		commitSubjects,
		diff,
		resultSha,
	};
}

interface BuildBaseline {
	readonly targetDir: string;
	readonly taskSha: string;
}

async function assertBuildCommitted(
	{ targetDir, taskSha }: BuildBaseline,
	expectedBranch: ExpectedBranch = "main",
	commitSubjectPattern?: string,
): Promise<{
	resultSha: string;
	diff: string;
	commitSubjects: string[];
}> {
	const resultSha = await committedBuildHead(
		targetDir,
		taskSha,
		expectedBranch,
	);

	await assertTaskHistory(
		{ baselineSha: taskSha, resultSha, targetDir },
		"Build phase rewrote or discarded task history",
	);
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

	return { commitSubjects, diff, resultSha };
}

function assertCommitSubjects(
	subjects: readonly string[],
	pattern: string,
): void {
	const subjectPattern = new RegExp(pattern, "u");
	const invalidSubjects = subjects.filter(
		(subject) => !subjectPattern.test(subject),
	);

	if (invalidSubjects.length > EMPTY_COLLECTION_LENGTH) {
		throw new StageValidationError(
			`Build commit subjects do not match the pipeline's convention: ${invalidSubjects.join(", ")}`,
		);
	}
}
interface TargetHistoryRange {
	readonly targetDir: string;
	readonly baselineSha: string;
	readonly resultSha: string;
}
async function assertTaskHistory(
	{ targetDir, baselineSha, resultSha }: TargetHistoryRange,
	message: string,
): Promise<void> {
	try {
		await git(targetDir, "merge-base", "--is-ancestor", baselineSha, resultSha);
	} catch (error) {
		if (
			error instanceof CommandError &&
			error.exitCode === GIT_QUERY_NEGATIVE_EXIT_CODE
		) {
			throw new StageValidationError(message);
		}

		throw error;
	}
}
async function assertPlanningWorkspace(
	targetDir: string,
	expectedBranch: ExpectedBranch,
): Promise<void> {
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
}
async function committedBuildHead(
	targetDir: string,
	taskSha: string,
	expectedBranch: ExpectedBranch,
): Promise<string> {
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

	return resultSha;
}

export {
	assertWorkspaceCleanAt,
	capturePlanningAdvance,
	assertBuildCommitted,
	assertCommitSubjects,
};
export type { ExpectedBranch, BuildBaseline };
