import { realpath } from "node:fs/promises";
import { join, relative } from "node:path";

import { z } from "zod";

import { existingBacklogLayout } from "./backlog-layout";
import { CONTROL_DIR } from "./config";
import { RefusedPreconditionError } from "./exit-codes";
import MissingDirectoryError from "./missing-directory-error";
import { git, optionalGit } from "./target-repository";
import { managedWorkflowPaths } from "./workflow-state";

const EMPTY_COLLECTION_LENGTH = 0;
interface SourceBaseline {
	readonly root: string;
	readonly sha: string;
	readonly origin?: string | undefined;
}

async function readySourceRoot(sourceDir: string): Promise<string> {
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

	return sourceRoot;
}

async function assertSourceReady(sourceDir: string): Promise<SourceBaseline> {
	const sourceRoot = await readySourceRoot(sourceDir);

	const sha = await optionalGit(
		sourceRoot,
		"rev-parse",
		"--verify",
		"--quiet",
		"refs/heads/main^{commit}",
	);
	if (sha === undefined) {
		throw new Error("Target must have a main branch");
	}

	return {
		origin: await optionalGit(sourceRoot, "remote", "get-url", "origin"),
		root: sourceRoot,
		sha,
	};
}

async function assertControlReady(): Promise<string> {
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

	return await git(CONTROL_DIR, "rev-parse", "HEAD");
}

async function assertWorkflowBoardPrivate(targetDir: string): Promise<void> {
	const layout = await existingBacklogLayout(targetDir);
	const configPath =
		layout === undefined ? undefined : relative(targetDir, layout.configPath);
	const trackedBoardFiles: string[] = [];

	await Array.fromAsync(await managedWorkflowPaths(targetDir), async (path) => {
		if (path === "backlog.config.yml") {
			return;
		}

		const tracked = await git(targetDir, "ls-files", "-z", "--", path);
		trackedBoardFiles.push(
			...tracked
				.split("\0")
				.filter(
					(trackedPath) => trackedPath !== "" && trackedPath !== configPath,
				),
		);
	});

	if (trackedBoardFiles.length > EMPTY_COLLECTION_LENGTH) {
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
	pid: z.number(),
	run: z.string().nonempty().optional(),
	startedAt: z.iso.datetime(),
});

type RunMarker = z.infer<typeof runMarkerSchema>;

/**
 * Undefined for a checkout nothing has claimed, or one that is gone, which
 * only a run's end or an operator removes: both read as "nothing to reconcile"
 * to a caller reconciling crashed runs, not as an error.
 */
async function readRunMarker(root: string): Promise<RunMarker | undefined> {
	const existingRunMarkerPath = async (): Promise<string | undefined> => {
		try {
			return await runMarkerPath(root);
		} catch (error) {
			if (error instanceof MissingDirectoryError) {
				return undefined;
			}

			throw error;
		}
	};

	const path = await existingRunMarkerPath();
	if (path === undefined) {
		return undefined;
	}

	const marker = Bun.file(path);
	if (!(await marker.exists())) {
		return undefined;
	}

	return runMarkerSchema.parse(JSON.parse(await marker.text()));
}

async function claimTarget(source: SourceBaseline, run: string): Promise<void> {
	await Bun.write(
		await runMarkerPath(source.root),
		`${JSON.stringify({
			pid: process.pid,
			run,
			startedAt: new Date().toISOString(),
		})}\n`,
	);
}

export {
	git,
	currentSha,
	recordRetentionRef,
	retentionRef,
	refExists,
	addWorktree,
	removeWorktree,
	pruneWorktrees,
	changedPathsBetween,
} from "./target-repository";
export { captureBuildCandidate, snapshotCheckout } from "./target-snapshot";
export type { BuildCandidate } from "./target-snapshot";
export {
	assertWorkspaceCleanAt,
	capturePlanningAdvance,
	assertBuildCommitted,
	assertCommitSubjects,
} from "./target-stage-validation";
export type { BuildBaseline, ExpectedBranch } from "./target-stage-validation";
export {
	assertSourceReady,
	assertControlReady,
	assertWorkflowBoardPrivate,
	readRunMarker,
	claimTarget,
};
export type { SourceBaseline, RunMarker };
