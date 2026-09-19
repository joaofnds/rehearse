import { cp, lstat, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { runCommand } from "./command";
import { STORED_GIT_DIRECTORY } from "./git-directory-name";

export const STATE_EVIDENCE_DIRECTORY = "state";

/**
 * The corpus overlay is an input the record already carries as per-file
 * digests, not something the session left behind, so copying it would put a
 * second copy of the corpus in every attempt's evidence.
 */
const CORPUS_OVERLAY_DIRECTORY = ".claude";

/**
 * `core.hooksPath` must name a directory that holds no hook, and it is created
 * inside the restore so it is removed with it.
 */
const NO_HOOKS_DIRECTORY = ".rehearse-no-hooks";

/**
 * A recursive filesystem copy is what carries the state a grade reads: dirty
 * tracked files, untracked files, ignored files, and byte-identical commit
 * SHAs. A bundle carries no untracked or ignored file and a textual diff
 * carries neither mode nor history, so neither reconstructs a
 * tree-cleanliness grade.
 *
 * `.git` is stored under `dot-git` for the reason a fixture does: the saved
 * copy travels with the attempt's record, and git refuses to commit a nested
 * repository. The copy is never committed, because a commit round trip drops
 * the empty `refs/tags` a fresh repository carries and a later restore would
 * then walk out to whatever repository encloses it.
 *
 * A symlink the session left is dropped rather than copied. A recursive copy
 * preserves one, and the saved evidence outlives the attempt directory, so a
 * link the session planted would resolve against the operator's own files from
 * the record and from every restore made out of it: a scorer reading it reports
 * their contents as a grade. `seedFixture` refuses a symlink on the way in for
 * the same reason. Retention drops rather than refuses, because a session under
 * test is not a case author who can be asked to fix its tree, and one link must
 * not discard the evidence for everything else the session did.
 */
export async function preserveStateEvidence(
	attemptDirectory: string,
	recordDirectory: string,
): Promise<string> {
	const destination = join(recordDirectory, STATE_EVIDENCE_DIRECTORY);

	await cp(attemptDirectory, destination, {
		recursive: true,
		filter: async (source) => {
			if (source === join(attemptDirectory, CORPUS_OVERLAY_DIRECTORY)) {
				return false;
			}

			const entry = await lstat(source);

			return !entry.isSymbolicLink();
		},
	});

	const gitDirectory = join(destination, ".git");
	if (await Bun.file(join(gitDirectory, "HEAD")).exists()) {
		await rename(gitDirectory, join(destination, STORED_GIT_DIRECTORY));
	}

	return destination;
}

/**
 * Each grade reads its own copy, which is what keeps one grader's writes out
 * of the evidence and out of the next grade's input: isolation is a property
 * of restoring rather than of any lock or permission on the saved bytes.
 *
 * The empty `refs/heads` and `refs/tags` are recreated for the reason seeding
 * recreates them. The copy preserved them, but a `dot-git` that reached the
 * record through a commit did not, and without them git resolves the
 * repository to whatever encloses the restore directory.
 */
export async function restoreStateEvidence(
	evidenceDirectory: string,
	destination: string,
): Promise<string> {
	await cp(evidenceDirectory, destination, { recursive: true });
	await mkdir(join(destination, NO_HOOKS_DIRECTORY), { recursive: true });

	const storedGit = join(destination, STORED_GIT_DIRECTORY);
	if (!(await Bun.file(join(storedGit, "HEAD")).exists())) {
		return destination;
	}

	const gitDirectory = join(destination, ".git");
	await rename(storedGit, gitDirectory);
	await mkdir(join(gitDirectory, "refs", "heads"), { recursive: true });
	await mkdir(join(gitDirectory, "refs", "tags"), { recursive: true });

	return destination;
}

/**
 * A session under test can write `.git/hooks/post-index-change`, and a grade
 * that runs `git status` against the restored copy fires it: measured on git
 * 2.55.0, the hook executed on this machine. Deleting `hooks/` at retention
 * time does not close it, also measured, because the session can reach the
 * same execution through `core.fsmonitor` in the repository's own config.
 *
 * The guard is environmental rather than a rewrite of the stored bytes,
 * because a scorer is an arbitrary command whose own `git` calls inherit no
 * per-invocation `-c` flags. `GIT_CONFIG_COUNT` and its keys are read by
 * every git process in the environment, so pointing `core.hooksPath` at an
 * empty directory and clearing `core.fsmonitor` suppresses both vectors for
 * the harness's git calls and the scorer's alike, with history still readable.
 *
 * Every command that touches restored evidence goes through here, so the guard
 * cannot be left off one call site.
 */
export function runAgainstStateEvidence(
	command: readonly string[],
	restoreDirectory: string,
	options: { readonly timeoutMs?: number | undefined } = {},
): Promise<string> {
	return runCommand(command, restoreDirectory, {
		env: {
			GIT_CONFIG_COUNT: "2",
			GIT_CONFIG_KEY_0: "core.hooksPath",
			GIT_CONFIG_VALUE_0: join(restoreDirectory, NO_HOOKS_DIRECTORY),
			GIT_CONFIG_KEY_1: "core.fsmonitor",
			GIT_CONFIG_VALUE_1: "",
		},
		timeoutMs: options.timeoutMs,
	});
}
