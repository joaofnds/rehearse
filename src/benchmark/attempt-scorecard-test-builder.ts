import type { Immutable } from "./contracts";

interface ScorecardFixture {
	readonly stage: string;
	readonly rubricPath: string;
	readonly costUsd: number;
	readonly prompt: string;
	readonly grade: {
		readonly hardBlockers: readonly never[];
		readonly requirements: readonly never[];
		readonly dimensions: readonly { id: string; grade: string }[];
		readonly summary: string;
		readonly grade: string;
		readonly verdict: string;
	};
	readonly input: {
		readonly stage: string;
		readonly artifact: { path: string; content: string };
	};
}
class AttemptScorecardBuilder {
	readonly #props: Immutable<Partial<ScorecardFixture>>;
	public constructor(props: Immutable<Partial<ScorecardFixture>> = {}) {
		this.#props = props;
	}
	public build(): ScorecardFixture {
		return {
			costUsd: 1.1,
			grade: {
				dimensions: [
					{
						grade: "B",
						id: "clarity",
					},
				],
				grade: "B",
				hardBlockers: [],
				requirements: [],
				summary: "fine",
				verdict: "CONTINUE",
			},
			input: {
				artifact: {
					content: "old spec\n",
					path: "backlog/docs/D.md",
				},
				stage: "discuss",
			},
			prompt: "p",
			rubricPath: "rubrics/discuss.json",
			stage: "discuss",
			...this.#props,
		};
	}
}
export default AttemptScorecardBuilder;
export type { ScorecardFixture };
