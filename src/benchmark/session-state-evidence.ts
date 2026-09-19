import { cp, rename } from "node:fs/promises";
import { join } from "node:path";
import { STORED_GIT_DIRECTORY } from "./git-directory-name";

export const STATE_EVIDENCE_DIRECTORY = "state";

/**
 * The corpus overlay is an input the record already carries as per-file
 * digests, not something the session left behind, so copying it would put a
 * second copy of the corpus in every attempt's evidence.
 */
const CORPUS_OVERLAY_DIRECTORY = ".claude";

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
 */
export async function preserveStateEvidence(
	attemptDirectory: string,
	recordDirectory: string,
): Promise<string> {
	const destination = join(recordDirectory, STATE_EVIDENCE_DIRECTORY);

	await cp(attemptDirectory, destination, {
		recursive: true,
		filter: (source) =>
			source !== join(attemptDirectory, CORPUS_OVERLAY_DIRECTORY),
	});

	const gitDirectory = join(destination, ".git");
	if (await Bun.file(join(gitDirectory, "HEAD")).exists()) {
		await rename(gitDirectory, join(destination, STORED_GIT_DIRECTORY));
	}

	return destination;
}
