import { describe, expect, it } from "bun:test";
import {
	deriveBaselineCorpus,
	needsComparisonManifest,
} from "./baseline-corpus";

const shared = {
	"CLAUDE.md": "c".repeat(64),
	"skills/review/SKILL.md": "r".repeat(64),
};

function corpus(
	files: Readonly<Record<string, string>>,
): ReadonlyMap<string, string> {
	return new Map(Object.entries(files));
}

describe(deriveBaselineCorpus.name, () => {
	it("removes the whole skill under test from arm A when the arms differ in one skill", () => {
		const derived = deriveBaselineCorpus(
			corpus({
				...shared,
				"skills/build/SKILL.md": "a".repeat(64),
				"skills/build/reference.md": "b".repeat(64),
			}),
			corpus({
				...shared,
				"skills/build/SKILL.md": "d".repeat(64),
				"skills/build/reference.md": "b".repeat(64),
			}),
		);

		expect(derived).toEqual({
			kind: "derived",
			skillUnderTest: "skills/build/",
			files: corpus(shared),
		});
	});

	it("runs arm A's own corpus when the skill under test is new in arm B", () => {
		const derived = deriveBaselineCorpus(
			corpus(shared),
			corpus({ ...shared, "skills/build/SKILL.md": "d".repeat(64) }),
		);

		expect(derived).toEqual({
			kind: "armA",
			skillUnderTest: "skills/build/",
			files: corpus(shared),
		});
	});

	it("refuses identical arms", () => {
		expect(deriveBaselineCorpus(corpus(shared), corpus(shared))).toEqual({
			kind: "refused",
			reason: "arms A and B hold identical corpora, so nothing is under test",
			differingUnits: [],
		});
	});

	it("refuses and names every unit when the arms differ in more than one", () => {
		const derived = deriveBaselineCorpus(
			corpus({ ...shared, "skills/build/SKILL.md": "a".repeat(64) }),
			corpus({
				...shared,
				"skills/build/SKILL.md": "d".repeat(64),
				"agents/helper.md": "h".repeat(64),
			}),
		);

		expect(derived).toEqual({
			kind: "refused",
			reason: "arms A and B differ in more than one corpus unit",
			differingUnits: ["agents/helper.md", "skills/build/"],
		});
	});

	it("refuses a differing unit that is not a skill, which needs a manifest-supplied control", () => {
		const derived = deriveBaselineCorpus(
			corpus(shared),
			corpus({ ...shared, "CLAUDE.md": "e".repeat(64) }),
		);

		expect(derived).toEqual({
			kind: "refused",
			reason:
				"the arms differ in CLAUDE.md, which is not a skill; supply the control through a comparison manifest",
			differingUnits: ["CLAUDE.md"],
		});
	});
});

describe(needsComparisonManifest.name, () => {
	it.each([
		["CLAUDE.md", true],
		["agents/reviewer.md", true],
		["skills/build/SKILL.md", false],
		["skills/build/reference.md", false],
	])("says an edit to %s needs a comparison manifest: %p", (path, needed) => {
		expect(needsComparisonManifest(path)).toBe(needed);
	});
});
