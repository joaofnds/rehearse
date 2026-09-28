export class CommandSilenceError extends Error {
	public override name = "CommandSilenceError";

	public constructor(
		public readonly command: readonly string[],
		public readonly silenceLimitMs: number,
	) {
		super(
			`Command wrote nothing for ${silenceLimitMs} ms, its silence limit, and was killed: ${command.join(" ")}`,
		);
	}
}
