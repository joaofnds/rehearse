import type { Immutable } from "#benchmark/contracts";
import type { ReportArm } from "#server/comparison-arm-figures";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

type ArmSource = ReportArm["source"];
class ComparisonSourceBuilder {
	public constructor(
		private readonly props: Immutable<Partial<ArmSource>> = {},
	) {}
	public build(): Immutable<ArmSource> {
		return {
			group: { path: "group.json", sha256: "a".repeat(SHA256_HEX_DIGITS) },
			reps: [],
			...this.props,
		};
	}
}
export { ComparisonSourceBuilder as default };
