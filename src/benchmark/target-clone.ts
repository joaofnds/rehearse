import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { git, refExists, retentionRef } from "./target";

/**
 * The checkout a run works in: a fresh clone of the target's main, so the
 * operator's own checkout, with its untracked files and linked board, is
 * neither read nor written by the run.
 */
export async function cloneTarget(targetRoot: string): Promise<string> {
	// The provider names a session's transcript after its real working path.
	const parent = await realpath(
		await mkdtemp(join(tmpdir(), "rehearse-target-")),
	);
	const clone = join(parent, basename(targetRoot));
	try {
		await git(
			parent,
			"clone",
			"--quiet",
			"--branch",
			"main",
			targetRoot,
			clone,
		);
	} catch (error) {
		await discardClone(clone);
		throw error;
	}

	return clone;
}

/** Removes the clone and the directory made to hold it. */
export async function discardClone(clone: string): Promise<void> {
	await rm(dirname(clone), { force: true, recursive: true });
}

/**
 * Copies the run's retention ref, and the commits it keeps, from the clone into
 * the target, so replays find them there once the clone is removed.
 */
export async function retainInTarget(
	clone: string,
	targetRoot: string,
	runName: string,
): Promise<void> {
	const ref = retentionRef(runName);
	if (!(await refExists(clone, ref))) {
		return;
	}

	await git(
		targetRoot,
		"fetch",
		"--quiet",
		"--no-tags",
		clone,
		`${ref}:${ref}`,
	);
}

/**
 * Removes the clone once the target holds the run's commits. A clone whose
 * commits the target could not take stays, since it holds their only copy.
 */
export async function releaseClone(
	clone: string,
	targetRoot: string,
	runName: string,
): Promise<void> {
	await retainInTarget(clone, targetRoot, runName);
	await discardClone(clone);
}
