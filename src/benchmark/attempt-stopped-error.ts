class AttemptStoppedError extends Error {
	public override name = "AttemptStoppedError";

	public constructor(directory: string) {
		super(
			`The session attempt in ${directory} was stopped by the operator, so no attempt record was written`,
		);
	}
}

export { AttemptStoppedError as default };
