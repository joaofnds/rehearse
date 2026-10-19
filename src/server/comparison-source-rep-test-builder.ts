import type { Immutable } from "#benchmark/contracts";
import type { ReportArm } from "#server/comparison-arm-figures";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

type ArmSourceRep = ReportArm["source"]["reps"][number];
class ComparisonSourceRepBuilder {
	public constructor(
		private readonly props: Immutable<Partial<ArmSourceRep>> = {},
	) {}
	public build(): Immutable<ArmSourceRep> {
		return {
			attempt: { path: "attempt.json", sha256: "c".repeat(SHA256_HEX_DIGITS) },
			ordinal: 1,
			outcomes: [
				{ grade: "A", name: "checks", status: "JUDGED", successful: true },
			],
			path: "rep-1.json",
			repId: "rep-1",
			sha256: "b".repeat(SHA256_HEX_DIGITS),
			...this.props,
		};
	}
}
export { ComparisonSourceRepBuilder as default };
