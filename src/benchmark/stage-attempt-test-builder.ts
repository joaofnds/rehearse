import type { Attempt } from "./attempt-contract";
import { stageOutputWords } from "./output-words";

class StageAttemptBuilder {
	readonly #props: Partial<Attempt>;
	#content = "old\n";
	public constructor(props: Partial<Attempt> = {}) {
		this.#props = props;
	}
	public withArtifactContent(content: string): this {
		this.#content = content;
		return this;
	}
	public build(): Attempt {
		const grade = this.#props.grade ?? "B";
		const artifact = this.#props.artifact ?? {
			content: this.#content,
			path: "backlog/docs/D.md",
		};

		return {
			artifact,
			dimensions: [{ grade, id: "clarity" }],
			grade,
			judgeCostUsd: 1.25,
			label: this.#props.label ?? "original run run1",
			verdict: "CONTINUE",
			words: stageOutputWords({ artifact: { content: artifact.content } }),
			...this.#props,
		};
	}
}
export default StageAttemptBuilder;
