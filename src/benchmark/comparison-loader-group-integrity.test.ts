import { describe, expect, it } from "bun:test";
import { dirname, join } from "node:path";

import { nameGroups } from "./comparison-additional-groups-fixture";
import { digest } from "./comparison-evidence-record-test-fixtures";
import { loadComparisonEvidence } from "./comparison-loader";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";

describe(loadComparisonEvidence.name, () => {
	const { fixture } = comparisonLoaderTestFixture();
	describe("when an arm names a group run on other inputs than its first", () => {
		it("refuses a group graded by another judge model", async () => {
			const groupId = await fixture.addGroup("case-1", "candidate");
			await fixture.changeGroup(groupId, (group) => ({
				...group,
				inputs: { ...group.inputs, judgeModel: "haiku" },
			}));

			expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
				"case case-1 arm candidate group groups/case-1-candidate-more/group.json field inputs.judgeModel differs from group groups/case-1-candidate/group.json",
			);
		});
		it("refuses a group that ran another corpus", async () => {
			const groupId = await fixture.addGroup("case-1", "candidate");
			const corpus = "inputs/corpus/build/SKILL.md";
			const corpusFile = join(dirname(fixture.groupFileOf(groupId)), corpus);
			await Bun.write(corpusFile, "edited corpus\n");
			await fixture.changeGroup(groupId, (group) => ({
				...group,
				inputs: {
					...group.inputs,
					files: group.inputs.files.map((file) =>
						file.path === corpus
							? { ...file, sha256: digest("edited corpus\n") }
							: file,
					),
				},
			}));

			expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
				"case case-1 arm candidate group groups/case-1-candidate-more/group.json field inputs.files.corpus differs from group groups/case-1-candidate/group.json",
			);
		});
		it("refuses a group named twice, whose reps would count twice", async () => {
			await nameGroups(fixture, {
				caseId: "case-1",
				groupIds: ["case-1-candidate", "case-1-candidate"],
				role: "candidate",
			});

			expect(loadComparisonEvidence(fixture.manifestFile)).rejects.toThrow(
				"case case-1 arm candidate group groups/case-1-candidate/group.json is named twice",
			);
		});
	});
});
