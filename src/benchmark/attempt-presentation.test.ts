import { describe, expect, it } from "bun:test";

import { diffTexts, presentAttempts } from "./attempts";
import StageAttemptBuilder from "./stage-attempt-test-builder";

const lineageInputs = {
	corpusFiles: [
		{ path: "CLAUDE.md", sha256: "aa11" },
		{ path: "skills/discuss/SKILL.md", sha256: "bb22" },
	],
	effort: "high",
	model: "sonnet",
} as const;
const showsGradesSideBySideAndDiffsTheLatestAttemptAgainstEarlier =
	async (): Promise<void> => {
		const output = await presentAttempts(
			"lineage-1",
			[
				new StageAttemptBuilder({ grade: "B", label: "original run run1" })
					.withArtifactContent("old\n")
					.build(),
				{
					...new StageAttemptBuilder({ grade: "A", label: "replay r2" })
						.withArtifactContent("new\n")
						.build(),
					totalCostUsd: 2.15,
				},
			],
			async (before, after) =>
				await Promise.resolve(`DIFF(${before.trim()}->${after.trim()})`),
		);

		expect(output).toContain("Attempts at checkpoint lineage-1:");
		expect(output).toContain(
			"1. original run run1 — grade B (CONTINUE), judge $1.25 [clarity B]",
		);
		expect(output).toContain(
			"2. replay r2 — grade A (CONTINUE), judge $1.25, total $2.15 [clarity A]",
		);
		expect(output).toContain("Diff, original run run1 → replay r2:");
		expect(output).toContain("DIFF(old->new)");
	};

const marksIdenticalArtifactsInsteadOfPrintingAnEmptyDiff =
	async (): Promise<void> => {
		const output = await presentAttempts(
			"lineage-1",
			[
				new StageAttemptBuilder({ grade: "B", label: "original run run1" })
					.withArtifactContent("same\n")
					.build(),
				new StageAttemptBuilder({ grade: "B", label: "replay r2" })
					.withArtifactContent("same\n")
					.build(),
			],
			diffTexts,
		);

		expect(output).toContain("(identical)");
	};

const presentsAttemptsThatShareAConsumedLineage = async (): Promise<void> => {
	const output = await presentAttempts(
		"lineage-1",
		[
			{
				...new StageAttemptBuilder({ grade: "B", label: "original run run1" })
					.withArtifactContent("old\n")
					.build(),
				lineageInputs,
			},
			{
				...new StageAttemptBuilder({ grade: "A", label: "replay r2" })
					.withArtifactContent("new\n")
					.build(),
				lineageInputs,
			},
		],
		diffTexts,
	);

	expect(output).toContain("Attempts at checkpoint lineage-1:");
};

const presentsAttemptsWhoseCorpusDiffersNamingTheFile =
	async (): Promise<void> => {
		const output = await presentAttempts(
			"lineage-1",
			[
				{
					...new StageAttemptBuilder({ grade: "B", label: "original run run1" })
						.withArtifactContent("old\n")
						.build(),
					lineageInputs,
				},
				{
					...new StageAttemptBuilder({ grade: "A", label: "replay r2" })
						.withArtifactContent("new\n")
						.build(),
					lineageInputs: {
						...lineageInputs,
						corpusFiles: [
							{ path: "CLAUDE.md", sha256: "aa11" },
							{ path: "skills/discuss/SKILL.md", sha256: "changed" },
						],
					},
				},
			],
			diffTexts,
		);

		expect(output).toContain("Attempts at checkpoint lineage-1:");
		expect(output).toContain("replay r2: skills/discuss/SKILL.md differs");
	};

const namesWhichAttemptACorpusFileAddedOrRemovedAgainstTheReference =
	async (): Promise<void> => {
		const output = await presentAttempts(
			"lineage-1",
			[
				{
					...new StageAttemptBuilder({ grade: "B", label: "original run run1" })
						.withArtifactContent("old\n")
						.build(),
					lineageInputs,
				},
				{
					...new StageAttemptBuilder({ grade: "A", label: "replay r2" })
						.withArtifactContent("new\n")
						.build(),
					lineageInputs: {
						...lineageInputs,
						corpusFiles: [
							{ path: "CLAUDE.md", sha256: "aa11" },
							{ path: "skills/discuss/SKILL.md", sha256: "bb22" },
							{ path: "skills/discuss/reference.md", sha256: "ee55" },
						],
					},
				},
			],
			diffTexts,
		);

		expect(output).toContain(
			"replay r2: skills/discuss/reference.md present in one attempt only",
		);
	};

const attributesEachAttemptsCorpusDifferenceSeparatelyWhenTwoReplaysEditTheSame =
	async (): Promise<void> => {
		const output = await presentAttempts(
			"lineage-1",
			[
				{
					...new StageAttemptBuilder({ grade: "B", label: "original run run1" })
						.withArtifactContent("old\n")
						.build(),
					lineageInputs,
				},
				{
					...new StageAttemptBuilder({ grade: "A", label: "replay r2" })
						.withArtifactContent("mid\n")
						.build(),
					lineageInputs: {
						...lineageInputs,
						corpusFiles: [
							{ path: "CLAUDE.md", sha256: "aa11" },
							{ path: "skills/discuss/SKILL.md", sha256: "cc33" },
						],
					},
				},
				{
					...new StageAttemptBuilder({ grade: "A", label: "replay r3" })
						.withArtifactContent("new\n")
						.build(),
					lineageInputs: {
						...lineageInputs,
						corpusFiles: [
							{ path: "CLAUDE.md", sha256: "aa11" },
							{ path: "skills/discuss/SKILL.md", sha256: "dd44" },
						],
					},
				},
			],
			diffTexts,
		);

		expect(output).toContain("replay r2: skills/discuss/SKILL.md differs");
		expect(output).toContain("replay r3: skills/discuss/SKILL.md differs");
	};

const presentsAttemptsThatRecordNoLineageInputsAsRecordsBeforeThisDid =
	async (): Promise<void> => {
		const output = await presentAttempts(
			"lineage-1",
			[
				new StageAttemptBuilder({ grade: "B", label: "original run run1" })
					.withArtifactContent("old\n")
					.build(),
				new StageAttemptBuilder({ grade: "A", label: "replay r2" })
					.withArtifactContent("new\n")
					.build(),
			],
			diffTexts,
		);

		expect(output).toContain("Attempts at checkpoint lineage-1:");
	};

const returnsAUnifiedDiffWhenTheContentsDifferAndNothingWhenEqual =
	async (): Promise<void> => {
		expect(await diffTexts("a\n", "a\n")).toBe("");
		const diff = await diffTexts("a\n", "b\n");
		expect(diff).toContain("-a");
		expect(diff).toContain("+b");
	};
describe(presentAttempts.name, () => {
	it(
		"shows grades side by side and diffs the latest attempt against earlier ones",
		showsGradesSideBySideAndDiffsTheLatestAttemptAgainstEarlier,
	);
	it(
		"marks identical artifacts instead of printing an empty diff",
		marksIdenticalArtifactsInsteadOfPrintingAnEmptyDiff,
	);
	it(
		"presents attempts that share a consumed lineage",
		presentsAttemptsThatShareAConsumedLineage,
	);
	it(
		"presents attempts whose corpus differs, naming the file",
		presentsAttemptsWhoseCorpusDiffersNamingTheFile,
	);
	it(
		"names which attempt a corpus file added or removed against the reference belongs to",
		namesWhichAttemptACorpusFileAddedOrRemovedAgainstTheReference,
	);
	it(
		"attributes each attempt's corpus difference separately when two replays edit the same file",
		attributesEachAttemptsCorpusDifferenceSeparatelyWhenTwoReplaysEditTheSame,
	);
	it(
		"presents attempts that record no lineage inputs, as records before this did",
		presentsAttemptsThatRecordNoLineageInputsAsRecordsBeforeThisDid,
	);
});
describe(diffTexts.name, () => {
	it(
		"returns a unified diff when the contents differ and nothing when equal",
		returnsAUnifiedDiffWhenTheContentsDifferAndNothingWhenEqual,
	);
});
