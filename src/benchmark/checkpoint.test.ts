import { describe, expect, expectTypeOf, it } from "bun:test";

import type { StalenessRequest } from "./checkpoint";
import { lineageKey } from "./checkpoint";

const FIRST_CORPUS_FILE_INDEX = 0;

const SECOND_CORPUS_FILE_INDEX = 1;

const BASELINE_LINEAGE_COUNT = 1;

const SHA256_HEX_DIGITS = 64;

const lineageInputs = {
	corpusFiles: [
		{ path: "CLAUDE.md", sha256: "aa11" },
		{ path: ".claude/skills/discuss/SKILL.md", sha256: "bb22" },
	],
	effort: "high",
	model: "sonnet",
	upstream: "root-key",
} as const;

function testKeepsAvailableAndUnavailableCurrentSettingsMutuallyExclusive(): void {
	expectTypeOf({
		model: "sonnet",
		settingsFile: {
			path: "stage-settings.json",
			sha256: "a".repeat(SHA256_HEX_DIGITS),
		},
		settingsFileRefusal: "stage settings are unavailable",
	}).not.toExtend<StalenessRequest>();
}

function testReturnsTheSameKeyForTheSameInputs(): void {
	expect(lineageKey({ ...lineageInputs })).toBe(
		lineageKey({ ...lineageInputs }),
	);
}

function testKeepsTheDigestRecordedForTheOrderedLineagePayload(): void {
	expect(lineageKey(lineageInputs)).toBe(
		"cee53523dc4e3fcc5faea577b763f9f89303ba07a1493cba12263a61ff7a1993",
	);
}

function testIgnoresTheOrderCorpusFilesAreListedIn(): void {
	expect(
		lineageKey({
			...lineageInputs,
			corpusFiles: lineageInputs.corpusFiles.toReversed(),
		}),
	).toBe(lineageKey(lineageInputs));
}

function testChangesWhenAnyLineageInputChanges(): void {
	const variants = [
		lineageKey({ ...lineageInputs, upstream: "other-upstream" }),
		lineageKey({
			...lineageInputs,
			corpusFiles: [
				lineageInputs.corpusFiles[FIRST_CORPUS_FILE_INDEX],
				{
					...lineageInputs.corpusFiles[SECOND_CORPUS_FILE_INDEX],
					sha256: "cc33",
				},
			],
		}),
		lineageKey({
			...lineageInputs,
			corpusFiles: [
				...lineageInputs.corpusFiles,
				{ path: "extra.md", sha256: "dd44" },
			],
		}),
		lineageKey({ ...lineageInputs, model: "opus" }),
		lineageKey({ ...lineageInputs, effort: "low" }),
		lineageKey({ ...lineageInputs, effort: undefined }),
		lineageKey({
			...lineageInputs,
			settingsFile: { path: "stage-settings.json", sha256: "ee55" },
		}),
	];

	expect(new Set([lineageKey(lineageInputs), ...variants]).size).toBe(
		variants.length + BASELINE_LINEAGE_COUNT,
	);
}

describe("checkpoint lineage identities", () => {
	it(
		"keeps available and unavailable current settings mutually exclusive",
		testKeepsAvailableAndUnavailableCurrentSettingsMutuallyExclusive,
	);
	it(
		"returns the same key for the same inputs",
		testReturnsTheSameKeyForTheSameInputs,
	);
	it(
		"keeps the digest recorded for the ordered lineage payload",
		testKeepsTheDigestRecordedForTheOrderedLineagePayload,
	);
	it(
		"ignores the order corpus files are listed in",
		testIgnoresTheOrderCorpusFilesAreListedIn,
	);
	it(
		"changes when any lineage input changes",
		testChangesWhenAnyLineageInputChanges,
	);
});
