import type { StageJudgeInput } from "./contracts";

class StageJudgeInputBuilder {
	public constructor(private readonly props: Partial<StageJudgeInput> = {}) {}

	public build(): StageJudgeInput {
		const stage = this.props.stage ?? "shape";
		return {
			baselineContext: [],
			instructions: "Instructions",
			kind: stage === "build" ? "delivery" : "planning",
			priorArtifacts: [],
			productBrief: "Brief",
			stage,
			task: "Task",
			taskState: "State",
			transcript: {
				costUsd: 1,
				exchanges: [],
				providerCalls: [],
				sessionId: "session",
				stage,
			},
			...this.props,
		};
	}
}

export { StageJudgeInputBuilder as default };
