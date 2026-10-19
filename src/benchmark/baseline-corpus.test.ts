import { describe, expect, it } from "bun:test";

import {
	deriveBaselineCorpus,
	needsComparisonManifest,
} from "./baseline-corpus";

const SHA256_HEX_DIGITS = 64;

const shared = {
	"CLAUDE.md": "c".repeat(SHA256_HEX_DIGITS),
	"skills/review/SKILL.md": "r".repeat(SHA256_HEX_DIGITS),
};

function corpus(
	files: Readonly<Record<string, string>>,
): ReadonlyMap<string, string> {
	return new Map(Object.entries(files));
}

const deriveBaselineCorpusRemovesTheWholeSkillUnderTestFromArmAWhenTheArmsDifferInOne =
	(): void => {
		const derived = deriveBaselineCorpus(
			corpus({
				...shared,
				"skills/build/SKILL.md": "a".repeat(SHA256_HEX_DIGITS),
				"skills/build/reference.md": "b".repeat(SHA256_HEX_DIGITS),
			}),
			corpus({
				...shared,
				"skills/build/SKILL.md": "d".repeat(SHA256_HEX_DIGITS),
				"skills/build/reference.md": "b".repeat(SHA256_HEX_DIGITS),
			}),
		);

		expect(derived).toEqual({
			files: corpus(shared),
			kind: "derived",
			skillUnderTest: "skills/build/",
		});
	};

const deriveBaselineCorpusRunsArmAsOwnCorpusWhenTheSkillUnderTestIsNewInArmB =
	(): void => {
		const derived = deriveBaselineCorpus(
			corpus(shared),
			corpus({
				...shared,
				"skills/build/SKILL.md": "d".repeat(SHA256_HEX_DIGITS),
			}),
		);

		expect(derived).toEqual({
			files: corpus(shared),
			kind: "armA",
			skillUnderTest: "skills/build/",
		});
	};

const deriveBaselineCorpusRefusesIdenticalArms = (): void => {
	expect(deriveBaselineCorpus(corpus(shared), corpus(shared))).toEqual({
		differingUnits: [],
		kind: "refused",
		reason: "arms A and B hold identical corpora, so nothing is under test",
	});
};

const deriveBaselineCorpusRefusesAndNamesEveryUnitWhenTheArmsDifferInMoreThanOne =
	(): void => {
		const derived = deriveBaselineCorpus(
			corpus({
				...shared,
				"skills/build/SKILL.md": "a".repeat(SHA256_HEX_DIGITS),
			}),
			corpus({
				...shared,
				"agents/helper.md": "h".repeat(SHA256_HEX_DIGITS),
				"skills/build/SKILL.md": "d".repeat(SHA256_HEX_DIGITS),
			}),
		);

		expect(derived).toEqual({
			differingUnits: ["agents/helper.md", "skills/build/"],
			kind: "refused",
			reason: "arms A and B differ in more than one corpus unit",
		});
	};

const deriveBaselineCorpusRefusesADifferingUnitThatIsNotASkillWhichNeedsAManifestsuppliedControl =
	(): void => {
		const derived = deriveBaselineCorpus(
			corpus(shared),
			corpus({ ...shared, "CLAUDE.md": "e".repeat(SHA256_HEX_DIGITS) }),
		);

		expect(derived).toEqual({
			differingUnits: ["CLAUDE.md"],
			kind: "refused",
			reason:
				"the arms differ in CLAUDE.md, which is not a skill; supply the control through a comparison manifest",
		});
	};

describe(deriveBaselineCorpus.name, () => {
	it(
		"removes the whole skill under test from arm A when the arms differ in one skill",
		deriveBaselineCorpusRemovesTheWholeSkillUnderTestFromArmAWhenTheArmsDifferInOne,
	);

	it(
		"runs arm A's own corpus when the skill under test is new in arm B",
		deriveBaselineCorpusRunsArmAsOwnCorpusWhenTheSkillUnderTestIsNewInArmB,
	);

	it("refuses identical arms", deriveBaselineCorpusRefusesIdenticalArms);

	it(
		"refuses and names every unit when the arms differ in more than one",
		deriveBaselineCorpusRefusesAndNamesEveryUnitWhenTheArmsDifferInMoreThanOne,
	);

	it(
		"refuses a differing unit that is not a skill, which needs a manifest-supplied control",
		deriveBaselineCorpusRefusesADifferingUnitThatIsNotASkillWhichNeedsAManifestsuppliedControl,
	);
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
