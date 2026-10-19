class MissingDirectoryError extends Error {
	public override name = "MissingDirectoryError";

	public constructor(
		public readonly directory: string,
		options?: Readonly<ErrorOptions>,
	) {
		super(`${directory} does not exist, so no command can run in it`, options);
	}
}

export { MissingDirectoryError as default };
