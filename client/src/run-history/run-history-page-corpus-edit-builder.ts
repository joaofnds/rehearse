import type { RowStaleness } from "#server/run-history";

interface CorpusEditFixture {
	readonly versions: number;
}

const FIRST_CHANGED_VERSION = 1;

class CorpusEditBuilder {
	public constructor(private readonly props: Partial<CorpusEditFixture> = {}) {}

	public build(): Extract<RowStaleness, { readonly state: "available" }> {
		return {
			causes: ["skills/build/SKILL.md changed"],
			changedFiles: [{ change: "changed", path: "skills/build/SKILL.md" }],
			distance: {
				kind: "measured",
				versions: this.props.versions ?? FIRST_CHANGED_VERSION,
			},
			onlyCorpusFiles: true,
			stale: true,
			state: "available",
		};
	}
}

export { CorpusEditBuilder as default };
