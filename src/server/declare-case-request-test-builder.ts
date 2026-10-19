import type { Immutable } from "#benchmark/contracts";

import type { DeclareCaseRequest } from "./case-declaration";

class DeclareCaseRequestBuilder {
	public constructor(
		private readonly props: Immutable<Partial<DeclareCaseRequest>> = {},
	) {}

	public build(): Immutable<DeclareCaseRequest> {
		return {
			checks: [
				{
					kind: "word-band",
					max: 1,
				},
			],
			corpusFiles: ["skills/build/SKILL.md"],
			id: "declared",
			kind: "session",
			model: "sonnet",
			prompt: "Reply OK.",
			title: "A declared case",
			tools: [],
			...this.props,
		};
	}
}

export { DeclareCaseRequestBuilder as default };
