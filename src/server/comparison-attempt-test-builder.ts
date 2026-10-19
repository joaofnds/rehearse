import type { Immutable } from "#benchmark/contracts";
import type { ComparisonAttempt } from "#server/comparison-attempts";

const DEFAULT_DECLARED_CHECKS = 19;

type RecordedStateChecks = NonNullable<ComparisonAttempt["stateChecks"]>;
type SavedStateCheckRequest = Pick<RecordedStateChecks, "passed"> &
	Partial<Pick<RecordedStateChecks, "declared">>;

class ComparisonAttemptBuilder {
	public constructor(
		private readonly props: Immutable<Partial<ComparisonAttempt>> = {},
	) {}
	public withStateChecks({
		passed,
		declared = DEFAULT_DECLARED_CHECKS,
	}: SavedStateCheckRequest): ComparisonAttemptBuilder {
		return new ComparisonAttemptBuilder({
			...this.props,
			stateChecks: {
				declared,
				failing:
					passed === declared
						? []
						: [{ detail: "history changed", name: "history-preserved" }],
				passed,
			},
		});
	}
	public build(): Immutable<ComparisonAttempt> {
		return {
			blockersFired: { reason: "not applicable", state: "unavailable" },
			checks: { declared: 1, failing: [], passed: 1 },
			ordinal: 1,
			outcomes: {
				outcomes: [
					{ grade: "A", name: "checks", status: "JUDGED", successful: true },
				],
				state: "available",
			},
			repId: "rep-1",
			stateChecks: {
				declared: 19,
				failing: [{ detail: "history changed", name: "history-preserved" }],
				passed: 12,
			},
			words: { reason: "not recorded", state: "unavailable" },
			...this.props,
		};
	}
}
export { ComparisonAttemptBuilder as default };
