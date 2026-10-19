import { corpusEntries, projectEntries } from "./context-manifest";
import type { StageReadManifestInputs } from "./read-manifest";

const SHA256_HEX_DIGITS = 64;
class StageReadManifestBuilder {
	readonly #values: Partial<StageReadManifestInputs>;
	public constructor(values: Partial<StageReadManifestInputs> = {}) {
		this.#values = values;
	}
	public build(): StageReadManifestInputs {
		return {
			corpusFiles: [
				{ path: "CLAUDE.md", sha256: "a".repeat(SHA256_HEX_DIGITS) },
				{
					path: "skills/shape/SKILL.md",
					sha256: "b".repeat(SHA256_HEX_DIGITS),
				},
				{ path: "rulebook/style.md", sha256: "c".repeat(SHA256_HEX_DIGITS) },
			],
			observed: {
				paths: [
					...corpusEntries(["skills/shape/SKILL.md", "rulebook/style.md"]),
					...projectEntries(["CLAUDE.md"]),
				],
			},
			rubric: {
				path: "rubrics/shape.json",
				sha256: "e".repeat(SHA256_HEX_DIGITS),
			},
			skill: "shape",
			targetFiles: [
				{ path: "CLAUDE.md", sha256: "d".repeat(SHA256_HEX_DIGITS) },
			],
			versionFiles: [],
			...this.#values,
		};
	}
}
export { StageReadManifestBuilder as default };
