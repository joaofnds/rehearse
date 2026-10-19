import type { StageReadsRequest } from "./stage-reads";

const SHA256_HEX_DIGITS = 64;
const GIT_SHA1_HEX_DIGITS = 40;
class StageReadsRequestBuilder {
	readonly #values: Partial<StageReadsRequest>;
	public constructor(values: Partial<StageReadsRequest> = {}) {
		this.#values = values;
	}
	public build(): StageReadsRequest {
		return {
			corpusFiles: [],
			corpusSources: [],
			rubric: {
				path: "rubrics/shape.json",
				sha256: "e".repeat(SHA256_HEX_DIGITS),
			},
			skill: "shape",
			startSha: "a".repeat(GIT_SHA1_HEX_DIGITS),
			targetDir: "/fixture/target",
			transcript: undefined,
			versionFiles: [],
			...this.#values,
		};
	}
}
export { StageReadsRequestBuilder as default };
