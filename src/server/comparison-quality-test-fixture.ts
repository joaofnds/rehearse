import type { ReliabilitySummary } from "#benchmark/confirmation-report";
import type { Immutable } from "#benchmark/contracts";

const DEFAULT_REQUESTED = 4;
const DEFAULT_SUCCESSFUL = 0;

class ReliabilitySummaryBuilder {
	public constructor(
		private readonly props: Immutable<Partial<ReliabilitySummary>> = {},
	) {}
	public build(): ReliabilitySummary {
		const {
			requested = DEFAULT_REQUESTED,
			successful = DEFAULT_SUCCESSFUL,
			name = "build",
		} = this.props;
		return {
			attempted: requested,
			failed: requested - successful,
			gradeDistribution:
				name === "checks"
					? Object.fromEntries([
							["A", successful],
							["F", requested - successful],
						])
					: {},
			name,
			notReached: 0,
			passK: 0,
			requested,
			standardError: 0,
			successRate: successful / requested,
			successful,
			...this.props,
		};
	}
}
export { ReliabilitySummaryBuilder as default };
