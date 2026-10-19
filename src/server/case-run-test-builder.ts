import type { Immutable } from "#benchmark/contracts";

import type { CaseRun } from "./case-figures";
import { SHA256_HEX_DIGITS } from "./digest-test-support";

class CaseRunBuilder {
	public constructor(
		private readonly props: Immutable<Partial<CaseRun>> = {},
	) {}

	public build(): CaseRun {
		return {
			corpusDigest: "b".repeat(SHA256_HEX_DIGITS),
			costUsd: 1,
			passed: true,
			...this.props,
		};
	}
}

export { CaseRunBuilder as default };
