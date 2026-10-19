import { readPromptFixture } from "./judge-prompt-fixtures";

const INITIAL_JUDGE_PROMPT_COUNT = 1;

interface PromptResponseFixture {
	readonly filename: "stage-response.json" | "final-response.json";
}

class JudgePromptObservation {
	private readonly prompts: string[] = [];

	public constructor(private readonly response: PromptResponseFixture) {}

	public readonly invoke = async (prompt: string): Promise<string> => {
		this.prompts.push(prompt);

		return await readPromptFixture(this.response.filename);
	};

	public observedPrompt(recordedPrompt: string): string {
		const [initialPrompt] = this.prompts;

		if (
			this.prompts.length !== INITIAL_JUDGE_PROMPT_COUNT ||
			initialPrompt !== recordedPrompt
		) {
			throw new Error(
				"Judge did not receive exactly the recorded initial prompt",
			);
		}

		return initialPrompt;
	}
}

export { JudgePromptObservation as default };
