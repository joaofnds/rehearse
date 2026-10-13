import { stat } from "node:fs/promises";
import { CommandError } from "./command";
import { MissingDirectoryError } from "./missing-directory-error";
import { git } from "./target";

export class ReplaySourceGoneError extends Error {
	public override name = "ReplaySourceGoneError";

	public constructor(
		public readonly recorded: string,
		public readonly declared: string | undefined,
		public readonly sha: string,
	) {
		super(
			declared === undefined
				? `${recorded} no longer exists and the case declares no target, so commit ${sha} cannot be checked out to replay from`
				: `${recorded} no longer exists and ${declared} does not hold commit ${sha}, so it cannot be checked out to replay from`,
		);
	}
}

/**
 * The repository a replay checks its checkpoint's commit out from. A run
 * records the repository it ran in, which is often a temporary clone of the
 * case's target, so once that clone is gone the case's declared target serves
 * the same commit.
 */
export async function replaySourceRoot(source: {
	readonly recorded: string;
	readonly declared: string | undefined;
	readonly sha: string;
}): Promise<string> {
	if (await exists(source.recorded)) {
		return source.recorded;
	}
	if (
		source.declared !== undefined &&
		(await holdsCommit(source.declared, source.sha))
	) {
		return source.declared;
	}

	throw new ReplaySourceGoneError(source.recorded, source.declared, source.sha);
}

async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);

		return true;
	} catch {
		return false;
	}
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
