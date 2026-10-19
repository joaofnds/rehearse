import { CommandError } from "./command";
import MissingDirectoryError from "./missing-directory-error";
import serialMap from "./serial-map";
import { git } from "./target";

class RunCommitGoneError extends Error {
	public override name = "RunCommitGoneError";

	public constructor(
		public readonly searched: readonly string[],
		public readonly sha: string,
	) {
		super(`None of ${searched.join(", ")} holds commit ${sha}`);
	}
}

/** The repositories a run's commits can be read from. */
interface RunRepositories {
	/** The target the run copied its commits into, none for a run that worked in its target in place. */
	readonly target: string | undefined;
	/** The run's own checkout, which its end removes unless the commits could not be copied out. */
	readonly checkout: string;
	/** The target the case declares, which holds the commits a run starts from. */
	readonly declared: string | undefined;
}

/**
 * The first repository holding the commit, the target first because it
 * outlives the run, while a worktree added to the run's checkout breaks when
 * the run removes it.
 */
async function repositoryHolding(
	run: RunRepositories,
	sha: string,
): Promise<string> {
	const searched = [
		...new Set([run.target, run.checkout, run.declared]),
	].filter((repository) => repository !== undefined);
	for await (const inspection of serialMap(
		searched.values(),
		async (repository) => ({
			holds: await holdsCommit(repository, sha),
			repository,
		}),
	)) {
		const { repository, holds } = inspection;
		if (holds) {
			return repository;
		}
	}

	throw new RunCommitGoneError(searched, sha);
}

async function holdsCommit(repository: string, sha: string): Promise<boolean> {
	try {
		await git(repository, "cat-file", "-e", `${sha}^{commit}`);

		return true;
	} catch (error) {
		if (
			error instanceof CommandError ||
			error instanceof MissingDirectoryError
		) {
			return false;
		}

		throw error;
	}
}

export { RunCommitGoneError, repositoryHolding };
export type { RunRepositories };
