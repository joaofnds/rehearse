import { describe, expect, it } from "bun:test";

import { deriveStaleness } from "./checkpoint";
import {
	CheckpointChainBuilder,
	claudeMd,
	doctrine,
} from "./checkpoint-chain-test-builder";
import {
	StageCorpusBuilder,
	chain,
	request,
	unchangedCorpus,
} from "./checkpoint-staleness-test-fixture";

function testReportsEveryCheckpointFreshWhenNothingChanged(): void {
	const staleness = deriveStaleness(chain, new Map(unchangedCorpus), request);

	expect(staleness.map(({ stage, stale }) => [stage, stale])).toEqual([
		["initial", false],
		["shape", false],
		["build", false],
	]);
}

function testMarksTheEditedStageAndEverythingDownstreamStaleNamingTheFile(): void {
	const staleness = deriveStaleness(
		chain,
		new Map([
			...unchangedCorpus,
			[
				"shape",
				new StageCorpusBuilder({
					hashed: [
						claudeMd,
						doctrine,
						{ path: "skills/shape/SKILL.md", sha256: "changed" },
					],
				}).build(),
			],
		]),
		request,
	);

	expect(staleness.map(({ stage, stale }) => [stage, stale])).toEqual([
		["initial", false],
		["shape", true],
		["build", true],
	]);
	const [, observedSecondStageStaleness, observedThirdStageStaleness] =
		staleness;

	expect(observedSecondStageStaleness?.causes).toEqual([
		"skills/shape/SKILL.md changed",
	]);
	expect(observedThirdStageStaleness?.causes).toEqual([
		"upstream stage shape is stale",
	]);
}

function testMarksEveryStageCheckpointStaleWhenAGlobalInstructionFileChanges(): void {
	const edited = { path: "CLAUDE.md", sha256: "edited" } as const;

	const staleness = deriveStaleness(
		chain,
		new Map([
			...unchangedCorpus,
			[
				"shape",
				new StageCorpusBuilder({
					hashed: [
						edited,
						doctrine,
						{ path: "skills/shape/SKILL.md", sha256: "bb22" },
					],
				}).build(),
			],
			[
				"build",
				new StageCorpusBuilder({
					hashed: [
						edited,
						doctrine,
						{ path: "skills/build/SKILL.md", sha256: "cc33" },
					],
				}).build(),
			],
		]),
		request,
	);

	expect(staleness.map(({ stale }) => stale)).toEqual([false, true, true]);
	const [, observedSecondStageStaleness] = staleness;

	expect(observedSecondStageStaleness?.causes).toEqual(["CLAUDE.md changed"]);
}

function testMarksEveryStageCheckpointStaleWhenAGlobalSkillFileChanges(): void {
	const edited = {
		path: "skills/doctrine/SKILL.md",
		sha256: "edited",
	} as const;

	const staleness = deriveStaleness(
		chain,
		new Map([
			...unchangedCorpus,
			[
				"shape",
				new StageCorpusBuilder({
					hashed: [
						claudeMd,
						edited,
						{ path: "skills/shape/SKILL.md", sha256: "bb22" },
					],
				}).build(),
			],
			[
				"build",
				new StageCorpusBuilder({
					hashed: [
						claudeMd,
						edited,
						{ path: "skills/build/SKILL.md", sha256: "cc33" },
					],
				}).build(),
			],
		]),
		request,
	);

	expect(staleness.map(({ stale }) => stale)).toEqual([false, true, true]);
	const [, observedSecondStageStaleness] = staleness;

	expect(observedSecondStageStaleness?.causes).toEqual([
		"skills/doctrine/SKILL.md changed",
	]);
}

function testMarksEveryStageCheckpointStaleWhenARulebookFileChanges(): void {
	const rule = {
		path: "rulebook/coding-style.md",
		sha256: "rr55",
	} as const;
	const {
		initial: ruledInitial,
		planning: ruledPlanning,
		build: ruledBuild,
	} = new CheckpointChainBuilder({
		corpusFiles: [claudeMd, doctrine, rule],
	}).build();
	const ruledChain = [ruledInitial, ruledPlanning, ruledBuild];

	const edited = { ...rule, sha256: "edited" };

	const staleness = deriveStaleness(
		ruledChain,
		new Map([
			[
				"shape",
				new StageCorpusBuilder({
					hashed: [
						claudeMd,
						doctrine,
						edited,
						{ path: "skills/shape/SKILL.md", sha256: "bb22" },
					],
				}).build(),
			],
			[
				"build",
				new StageCorpusBuilder({ hashed: ruledBuild.corpusFiles }).build(),
			],
		]),
		request,
	);

	expect(staleness.map(({ stale }) => stale)).toEqual([false, true, true]);
	const [, observedSecondStageStaleness, observedThirdStageStaleness] =
		staleness;

	expect(observedSecondStageStaleness?.causes).toEqual([
		"rulebook/coding-style.md changed",
	]);
	expect(observedThirdStageStaleness?.causes).toEqual([
		"upstream stage shape is stale",
	]);
}

function testNamesACorpusFileTheRecordHasAndTheCorpusNoLongerDoes(): void {
	const staleness = deriveStaleness(
		chain,
		new Map([
			...unchangedCorpus,
			[
				"shape",
				new StageCorpusBuilder({ hashed: [claudeMd, doctrine] }).build(),
			],
		]),
		request,
	);

	const [, observedSecondStageStaleness] = staleness;

	expect(observedSecondStageStaleness?.stale).toBe(true);
	expect(observedSecondStageStaleness?.causes).toEqual([
		"skills/shape/SKILL.md removed",
	]);
}

function testNamesACorpusFileTheCorpusHasAndTheRecordDoesNot(): void {
	const staleness = deriveStaleness(
		chain,
		new Map([
			...unchangedCorpus,
			[
				"shape",
				new StageCorpusBuilder({
					hashed: [
						claudeMd,
						doctrine,
						{ path: "skills/shape/SKILL.md", sha256: "bb22" },
						{ path: "skills/shape/references/new.md", sha256: "ee55" },
					],
				}).build(),
			],
		]),
		request,
	);

	const [, observedSecondStageStaleness] = staleness;

	expect(observedSecondStageStaleness?.stale).toBe(true);
	expect(observedSecondStageStaleness?.causes).toEqual([
		"skills/shape/references/new.md added",
	]);
}

describe("checkpoint corpus changes", () => {
	it(
		"reports every checkpoint fresh when nothing changed",
		testReportsEveryCheckpointFreshWhenNothingChanged,
	);
	it(
		"marks the edited stage and everything downstream stale, naming the file",
		testMarksTheEditedStageAndEverythingDownstreamStaleNamingTheFile,
	);
	it(
		"marks every stage checkpoint stale when a global instruction file changes",
		testMarksEveryStageCheckpointStaleWhenAGlobalInstructionFileChanges,
	);
	it(
		"marks every stage checkpoint stale when a global skill file changes",
		testMarksEveryStageCheckpointStaleWhenAGlobalSkillFileChanges,
	);
	it(
		"marks every stage checkpoint stale when a rulebook file changes",
		testMarksEveryStageCheckpointStaleWhenARulebookFileChanges,
	);
	it(
		"names a corpus file the record has and the corpus no longer does",
		testNamesACorpusFileTheRecordHasAndTheCorpusNoLongerDoes,
	);
	it(
		"names a corpus file the corpus has and the record does not",
		testNamesACorpusFileTheCorpusHasAndTheRecordDoesNot,
	);
});
