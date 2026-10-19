interface RawStageEntry {
	readonly name: string | undefined;
	readonly kind: string | undefined;
	readonly skill: string | undefined;
	readonly artifact: string | undefined;
	readonly rubric: string | undefined;
}
class PipelineStageEntryBuilder {
	readonly #values: Partial<RawStageEntry>;
	public constructor(values: Partial<RawStageEntry> = {}) {
		this.#values = values;
	}
	public build(): RawStageEntry {
		return {
			artifact: "spec",
			kind: "planning",
			name: "discuss",
			rubric: "rubrics/discuss.json",
			skill: "discuss",
			...this.#values,
		};
	}
}
export { PipelineStageEntryBuilder as default };
