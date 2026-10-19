import type { NewRunEvent } from "./run-events";
import ReturningJudgeProgressBuilder from "./run-events-progress-test-builder";

class RunEventBuilder {
	public constructor(private readonly props: Partial<NewRunEvent> = {}) {}

	public build(): NewRunEvent {
		const fields = {
			elapsedMs: 0,
			runId: "run-1",
			spentUsd: 0,
			stage: "shape",
			...this.props,
		};
		if (this.props.kind === "judge-progress") {
			return {
				...fields,
				judge: this.props.judge ?? new ReturningJudgeProgressBuilder().build(),
				kind: "judge-progress",
				sessionId: undefined,
			};
		}

		if (this.props.kind === "stage-started" || this.props.kind === undefined) {
			return {
				...fields,
				judge: undefined,
				kind: "stage-started",
				sessionId: this.props.sessionId,
			};
		}

		return {
			...fields,
			judge: undefined,
			kind: this.props.kind,
			sessionId: undefined,
		};
	}
}

export { RunEventBuilder as default };
