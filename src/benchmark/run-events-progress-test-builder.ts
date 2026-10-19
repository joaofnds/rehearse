import type { JudgeProgress } from "./run-events";

type ReturningJudgeProgress = Extract<JudgeProgress, { state: "returning" }>;

class ReturningJudgeProgressBuilder {
	public constructor(
		private readonly props: Partial<ReturningJudgeProgress> = {},
	) {}

	public build(): ReturningJudgeProgress {
		return {
			attempt: 1,
			sections: {
				dimensions: { returned: 2, total: 5 },
				hardBlockers: { returned: 1, total: 4 },
				requirements: { returned: 0, total: 3 },
			},
			state: "returning",
			...this.props,
		};
	}
}

export { ReturningJudgeProgressBuilder as default };
