import { describe, expect, it } from "bun:test";

import type { HashedFile, StageCorpus } from "./checkpoint";
import { deriveStaleness } from "./checkpoint";
import { claudeMd, doctrine } from "./checkpoint-chain-test-builder";
import CheckpointRecordBuilder from "./checkpoint-record-test-builder";
import {
	StageCorpusBuilder,
	build,
	chain,
	initial,
	planning,
	request,
	unchangedCorpus,
} from "./checkpoint-staleness-test-fixture";

const FIRST_STAGE_AFTER_GRILL = 3;

const FIRST_STAGE_AFTER_PLANNING = 2;

function testBlamesTheFirstStaleStageNotTheNearestFurtherDownTheChain(): void {
	const review = new CheckpointRecordBuilder({
		corpusFiles: [
			claudeMd,
			doctrine,
			{
				path: "skills/review/SKILL.md",
				sha256: "ee55",
			},
		],
		stage: "review",
		upstream: build.lineage,
	}).build();
	const longer = [initial, planning, build, review] as const;
	const edited: readonly HashedFile[] = [
		claudeMd,
		doctrine,
		{ path: "skills/shape/SKILL.md", sha256: "changed" },
	];
	const corpus = new Map<string, StageCorpus>(
		longer
			.filter(({ stage }) => stage !== "initial")
			.map((record) => [
				record.stage,
				new StageCorpusBuilder({
					hashed: record.stage === "shape" ? edited : record.corpusFiles,
				}).build(),
			]),
	);

	const staleness = deriveStaleness(longer, corpus, request);

	expect(staleness.map(({ stale }) => stale)).toEqual([
		false,
		true,
		true,
		true,
	]);
	const observedFourthStageStaleness = staleness[FIRST_STAGE_AFTER_GRILL];

	expect(observedFourthStageStaleness?.causes).toEqual([
		"upstream stage shape is stale",
	]);
}

function testMarksThatStageStaleWithTheRefusalAsItsCause(): void {
	const staleness = deriveStaleness(
		chain,
		new Map([
			...unchangedCorpus,
			[
				"shape",
				new StageCorpusBuilder({
					refused: "skills/shape resolves outside",
				}).build(),
			],
		]),
		request,
	);

	const [, observedSecondStageStaleness] = staleness;

	expect(observedSecondStageStaleness?.stale).toBe(true);
	expect(observedSecondStageStaleness?.causes).toEqual([
		"skills/shape resolves outside",
	]);
}

function testCarriesTheRefusalDownstreamAsAnUpstreamCause(): void {
	const staleness = deriveStaleness(
		chain,
		new Map([
			...unchangedCorpus,
			[
				"shape",
				new StageCorpusBuilder({
					refused: "skills/shape resolves outside",
				}).build(),
			],
		]),
		request,
	);

	expect(staleness.map(({ stale }) => stale)).toEqual([false, true, true]);
	const observedThirdStageStaleness = staleness[FIRST_STAGE_AFTER_PLANNING];

	expect(observedThirdStageStaleness?.causes).toEqual([
		"upstream stage shape is stale",
	]);
}

describe(deriveStaleness.name, () => {
	it(
		"blames the first stale stage, not the nearest, further down the chain",
		testBlamesTheFirstStaleStageNotTheNearestFurtherDownTheChain,
	);
	describe("when a stage's corpus could not be hashed", () => {
		it(
			"marks that stage stale with the refusal as its cause",
			testMarksThatStageStaleWithTheRefusalAsItsCause,
		);
		it(
			"carries the refusal downstream as an upstream cause",
			testCarriesTheRefusalDownstreamAsAnUpstreamCause,
		);
	});
});
