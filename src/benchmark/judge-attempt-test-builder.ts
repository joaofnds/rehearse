import type { Immutable } from "./contracts";
import type { JudgeAttempt } from "./judge-attempt-contract";
import { CONFIRMATION_METRIC } from "./pipeline-confirmation-judging-test-fixtures";

class JudgeAttemptBuilder {
	public constructor(
		private readonly props: Immutable<Partial<JudgeAttempt>> = {},
	) {}
	public build(): Immutable<JudgeAttempt> {
		return {
			costUsd: CONFIRMATION_METRIC.costUsd,
			error: "invalid output",
			metrics: CONFIRMATION_METRIC,
			outcome: "REJECTED",
			payload: { invalid: true },
			...this.props,
		};
	}
}
export { JudgeAttemptBuilder as default };
