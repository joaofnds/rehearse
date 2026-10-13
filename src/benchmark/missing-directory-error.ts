/**
 * Spawning in a directory that does not exist fails with the command's name
 * in the error, which reads as the command being missing.
 */
export class MissingDirectoryError extends Error {
	public override name = "MissingDirectoryError";

	public constructor(public readonly directory: string) {
		super(`${directory} does not exist, so no command can run in it`);
	}
}
