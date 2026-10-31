class CommandsRefusedError extends Error {
	public override name = "CommandsRefusedError";

	public constructor(public readonly command: readonly string[]) {
		super(`Commands are refused once a stop has begun: ${command.join(" ")}`);
	}
}

export { CommandsRefusedError as default };
