import type { Immutable } from "#benchmark/contracts";
import ComparisonAttemptBuilder from "#server/comparison-attempt-test-builder";
import type { CaseAttempts } from "#server/comparison-attempts";

const DEFAULT_DECLARED_CHECKS = 19;
const PARTIAL_PASSED_CHECKS = 12;

class CaseAttemptsBuilder {
	public constructor(
		private readonly props: Immutable<Partial<CaseAttempts>> = {},
	) {}
	public build(): Immutable<CaseAttempts> {
		return {
			baseline: Array.from({ length: 6 }, () =>
				new ComparisonAttemptBuilder()
					.withStateChecks({ passed: PARTIAL_PASSED_CHECKS })
					.build(),
			),
			candidate: Array.from({ length: 6 }, () =>
				new ComparisonAttemptBuilder()
					.withStateChecks({ passed: DEFAULT_DECLARED_CHECKS })
					.build(),
			),
			control: Array.from({ length: 6 }, () =>
				new ComparisonAttemptBuilder()
					.withStateChecks({ passed: PARTIAL_PASSED_CHECKS })
					.build(),
			),
			...this.props,
		};
	}
}
export { CaseAttemptsBuilder as default };
