import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { git, refExists } from "./target";

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
	await git(parent, "clone", "--quiet", "--branch", "main", targetRoot, clone);

	return clone;
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
	const ref = `refs/rehearse/${runName}`;
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
