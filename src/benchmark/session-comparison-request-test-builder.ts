import { metrics } from "./session-comparison-attempt-test-fixture";
import SessionComparisonCaseBuilder from "./session-comparison-case-test-fixture";
import type { SessionConfirmationRequest } from "./session-confirmation";

class SessionComparisonRequestBuilder {
	public constructor(
		private readonly props: Partial<SessionConfirmationRequest> = {},
	) {}

	public build(): SessionConfirmationRequest {
		return {
			approvalMethod: "yes",
			corpus: "corpus",
			groupId: "case-one-baseline",
			model: "sonnet",
			preflight: { call: { metrics }, status: "COMPLETE" },
			projectedCost: {
				perRepMaximumUsd: 0.2,
				preflightMaximumUsd: 0.1,
				reps: 2,
				totalMaximumUsd: 0.5,
			},
			reps: 2,
			runsDirectory: "runs",
			sessionBudgetUsd: 0.2,
			sessionCase: new SessionComparisonCaseBuilder().build(),
			spendCeilingUsd: 100,
			...this.props,
		};
	}
}

export { SessionComparisonRequestBuilder as default };
export {
	default as ABSENT_HOME,
	attemptsInFlight,
} from "./session-setup-test-fixtures";
