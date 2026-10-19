/** Provider boundary fake: records prompts and consumes a response or failure per call. */
class JudgeResponseScript {
	public readonly prompts: string[] = [];
	private readonly pending: string[];
	private readonly failure: Readonly<Error> | undefined;

	public constructor(responses: readonly string[], failure?: Readonly<Error>) {
		this.failure = failure;
		this.pending = [...responses];
	}

	public readonly invoke = async (prompt: string): Promise<string> => {
		this.prompts.push(prompt);
		const next = this.pending.shift();
		if (next === undefined) {
			if (this.failure instanceof Error) {
				throw this.failure;
			}
			throw new Error("no scripted response left");
		}
		return await Promise.resolve(next);
	};
}

export { JudgeResponseScript as default };
