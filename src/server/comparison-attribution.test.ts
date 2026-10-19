import { describe, expect, it } from "bun:test";

import type { HashedFile } from "#benchmark/checkpoint";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

import { comparisonAttribution } from "./comparison-attribution";

function file(path: string, sha256: string): HashedFile {
	return { path, sha256 };
}

describe(comparisonAttribution.name, () => {
	it(
		"reports identical when every deduplicated file hash agrees between the two arms",
		verifyComparisonAttributionNameReportsIdenticalWhenEveryDeduplicatedFileHashAgreesBetweenTheTwoArms,
	);

	it(
		"attributes a file read at two stages once when it is the sole difference",
		verifyComparisonAttributionNameAttributesAFileReadAtTwoStagesOnceWhenItIsTheSoleDifference,
	);

	it(
		"lists every distinct differing path, sorted, when more than one file differs",
		verifyComparisonAttributionNameListsEveryDistinctDifferingPathSortedWhenMoreThanOneFileDiffers,
	);

	it(
		"attributes a file present in only one arm's corpus",
		verifyComparisonAttributionNameAttributesAFilePresentInOnlyOneArmSCorpus,
	);

	it(
		"attributes one file edited identically across every stage's corpus copy",
		verifyComparisonAttributionNameAttributesOneFileEditedIdenticallyAcrossEveryStageSCorpusCopy,
	);

	it(
		"keeps session corpus layout categories with the same basename distinct",
		verifyComparisonAttributionNameKeepsSessionCorpusLayoutCategoriesWithTheSameBasenameDistinct,
	);

	it(
		"keeps a nested corpus segment inside a session layout path",
		verifyComparisonAttributionNameKeepsANestedCorpusSegmentInsideASessionLayoutPath,
	);

	it(
		"normalizes a pipeline stage named corpus positionally",
		verifyComparisonAttributionNameNormalizesAPipelineStageNamedCorpusPositionally,
	);
});

function verifyComparisonAttributionNameReportsIdenticalWhenEveryDeduplicatedFileHashAgreesBetweenTheTwoArms(): void {
	const left = [
		file("CLAUDE.md", "a".repeat(SHA256_HEX_DIGITS)),
		file("CLAUDE.md", "a".repeat(SHA256_HEX_DIGITS)),
	];
	const right = [
		file("CLAUDE.md", "a".repeat(SHA256_HEX_DIGITS)),
		file("CLAUDE.md", "a".repeat(SHA256_HEX_DIGITS)),
	];

	const result = comparisonAttribution(left, right, "pipeline");

	expect(result).toEqual({ claim: "identical" });
}

function verifyComparisonAttributionNameAttributesAFileReadAtTwoStagesOnceWhenItIsTheSoleDifference(): void {
	const left = [
		file("CLAUDE.md", "a".repeat(SHA256_HEX_DIGITS)),
		file("CLAUDE.md", "a".repeat(SHA256_HEX_DIGITS)),
	];
	const right = [
		file("CLAUDE.md", "b".repeat(SHA256_HEX_DIGITS)),
		file("CLAUDE.md", "b".repeat(SHA256_HEX_DIGITS)),
	];

	const result = comparisonAttribution(left, right, "pipeline");

	expect(result).toEqual({
		claim: "attributable",
		differingPath: "CLAUDE.md",
		differingPaths: ["CLAUDE.md"],
	});
}

function verifyComparisonAttributionNameListsEveryDistinctDifferingPathSortedWhenMoreThanOneFileDiffers(): void {
	const left = [
		file("CLAUDE.md", "a".repeat(SHA256_HEX_DIGITS)),
		file("skills/build/SKILL.md", "a".repeat(SHA256_HEX_DIGITS)),
	];
	const right = [
		file("CLAUDE.md", "b".repeat(SHA256_HEX_DIGITS)),
		file("skills/build/SKILL.md", "c".repeat(SHA256_HEX_DIGITS)),
	];

	const result = comparisonAttribution(left, right, "pipeline");

	expect(result).toEqual({
		claim: "refused",
		differingPaths: ["CLAUDE.md", "skills/build/SKILL.md"],
	});
}

function verifyComparisonAttributionNameAttributesAFilePresentInOnlyOneArmSCorpus(): void {
	const left = [file("CLAUDE.md", "a".repeat(SHA256_HEX_DIGITS))];
	const right = [
		file("CLAUDE.md", "a".repeat(SHA256_HEX_DIGITS)),
		file("skills/discuss/SKILL.md", "a".repeat(SHA256_HEX_DIGITS)),
	];

	const result = comparisonAttribution(left, right, "pipeline");

	expect(result).toEqual({
		claim: "attributable",
		differingPath: "skills/discuss/SKILL.md",
		differingPaths: ["skills/discuss/SKILL.md"],
	});
}

function verifyComparisonAttributionNameAttributesOneFileEditedIdenticallyAcrossEveryStageSCorpusCopy(): void {
	const left = [
		file("inputs/corpus/discuss/CLAUDE.md", "a".repeat(SHA256_HEX_DIGITS)),
		file("inputs/corpus/build/CLAUDE.md", "a".repeat(SHA256_HEX_DIGITS)),
	];
	const right = [
		file("inputs/corpus/discuss/CLAUDE.md", "b".repeat(SHA256_HEX_DIGITS)),
		file("inputs/corpus/build/CLAUDE.md", "b".repeat(SHA256_HEX_DIGITS)),
	];

	const result = comparisonAttribution(left, right, "pipeline");

	expect(result).toEqual({
		claim: "attributable",
		differingPath: "CLAUDE.md",
		differingPaths: ["CLAUDE.md"],
	});
}

function verifyComparisonAttributionNameKeepsSessionCorpusLayoutCategoriesWithTheSameBasenameDistinct(): void {
	const left = [
		file("inputs/corpus/agents/team.md", "a".repeat(SHA256_HEX_DIGITS)),
	];
	const right = [
		file("inputs/corpus/output-styles/team.md", "a".repeat(SHA256_HEX_DIGITS)),
	];

	const result = comparisonAttribution(left, right, "session");

	expect(result).toEqual({
		claim: "refused",
		differingPaths: ["agents/team.md", "output-styles/team.md"],
	});
}

function verifyComparisonAttributionNameKeepsANestedCorpusSegmentInsideASessionLayoutPath(): void {
	const left = [
		file(
			"inputs/corpus/agents/corpus/output-styles/brief.md",
			"a".repeat(SHA256_HEX_DIGITS),
		),
		file("inputs/corpus/output-styles/brief.md", "a".repeat(SHA256_HEX_DIGITS)),
	];
	const right = [
		file(
			"inputs/corpus/agents/corpus/output-styles/brief.md",
			"a".repeat(SHA256_HEX_DIGITS),
		),
		file("inputs/corpus/output-styles/brief.md", "b".repeat(SHA256_HEX_DIGITS)),
	];

	const result = comparisonAttribution(left, right, "session");

	expect(result).toEqual({
		claim: "attributable",
		differingPath: "output-styles/brief.md",
		differingPaths: ["output-styles/brief.md"],
	});
}

function verifyComparisonAttributionNameNormalizesAPipelineStageNamedCorpusPositionally(): void {
	const left = [
		file("inputs/corpus/corpus/CLAUDE.md", "a".repeat(SHA256_HEX_DIGITS)),
	];
	const right = [
		file("inputs/corpus/corpus/CLAUDE.md", "b".repeat(SHA256_HEX_DIGITS)),
	];

	const result = comparisonAttribution(left, right, "pipeline");

	expect(result).toEqual({
		claim: "attributable",
		differingPath: "CLAUDE.md",
		differingPaths: ["CLAUDE.md"],
	});
}
