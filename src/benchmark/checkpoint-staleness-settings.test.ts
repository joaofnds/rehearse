import { describe, expect, it } from "bun:test";

import { deriveStaleness } from "./checkpoint";
import { claudeMd, doctrine } from "./checkpoint-chain-test-builder";
import CheckpointRecordBuilder from "./checkpoint-record-test-builder";
import {
	chain,
	initial,
	request,
	unchangedCorpus,
} from "./checkpoint-staleness-test-fixture";

const SHA256_HEX_DIGITS = 64;

function testMarksACheckpointStaleWhenTheSettingsFileSDigestNoLongerMatches(): void {
	const settingsFile = { path: "stage-settings.json", sha256: "ff66" };
	const withInitial = new CheckpointRecordBuilder({
		corpusFiles: [],
		settingsFile,
		stage: "initial",
		upstream: "root-key",
	}).build();
	const nextStage = new CheckpointRecordBuilder({
		corpusFiles: [
			claudeMd,
			doctrine,
			{
				path: "skills/shape/SKILL.md",
				sha256: "bb22",
			},
		],
		settingsFile,
		stage: "shape",
		upstream: withInitial.lineage,
	}).build();
	const withSettings = [withInitial, nextStage];

	const staleness = deriveStaleness(withSettings, new Map(unchangedCorpus), {
		...request,
		settingsFile: { ...settingsFile, sha256: "changed" },
	});

	expect(staleness.map(({ stage, stale }) => [stage, stale])).toEqual([
		["initial", true],
		["shape", true],
	]);
	const [observedFirstStageStaleness] = staleness;

	expect(observedFirstStageStaleness?.causes).toEqual([
		"stage settings file stage-settings.json changed",
	]);
}

function testUsesTheCurrentSettingsIdentityInsteadOfAForeignRecordedPath(): void {
	const recorded = new CheckpointRecordBuilder({
		corpusFiles: [],
		settingsFile: {
			path: "/Users/alice/old-checkout/stage-settings.json",
			sha256: "0".repeat(SHA256_HEX_DIGITS),
		},
		stage: "initial",
		upstream: "root-key",
	}).build();

	const [staleness] = deriveStaleness([recorded], new Map(), {
		...request,
		settingsFile: {
			path: "stage-settings.json",
			sha256: "1".repeat(SHA256_HEX_DIGITS),
		},
	});

	expect(staleness?.causes).toEqual([
		"stage settings file stage-settings.json changed",
	]);
}

function testMarksACheckpointStaleWhenCurrentSettingsAreUnavailable(): void {
	const refusal =
		"stage settings file cases/audit-log/settings.json is unavailable";

	const [staleness] = deriveStaleness([initial], new Map(), {
		...request,
		settingsFileRefusal: refusal,
	});

	expect(staleness?.causes).toEqual([refusal]);
}

function testMarksEveryCheckpointIncludingTheInitialOneStaleOnAModelChange(): void {
	const staleness = deriveStaleness(chain, new Map(unchangedCorpus), {
		...request,
		effort: "high",
		model: "opus",
	});

	expect(staleness.map(({ stale }) => stale)).toEqual([true, true, true]);
	const [observedFirstStageStaleness] = staleness;

	expect(observedFirstStageStaleness?.causes).toEqual([
		"model sonnet is now opus",
	]);
}

function testMarksEveryCheckpointIncludingTheInitialOneStaleOnAnEffortChange(): void {
	const staleness = deriveStaleness(chain, new Map(unchangedCorpus), {
		...request,
		effort: "low",
		model: "sonnet",
	});

	expect(staleness.map(({ stale }) => stale)).toEqual([true, true, true]);
	const [observedFirstStageStaleness] = staleness;

	expect(observedFirstStageStaleness?.causes).toEqual([
		"effort high is now low",
	]);
}

describe("checkpoint setting changes", () => {
	it(
		"marks a checkpoint stale when the settings file's digest no longer matches",
		testMarksACheckpointStaleWhenTheSettingsFileSDigestNoLongerMatches,
	);
	it(
		"uses the current settings identity instead of a foreign recorded path",
		testUsesTheCurrentSettingsIdentityInsteadOfAForeignRecordedPath,
	);
	it(
		"marks a checkpoint stale when current settings are unavailable",
		testMarksACheckpointStaleWhenCurrentSettingsAreUnavailable,
	);
	it(
		"marks every checkpoint including the initial one stale on a model change",
		testMarksEveryCheckpointIncludingTheInitialOneStaleOnAModelChange,
	);
	it(
		"marks every checkpoint including the initial one stale on an effort change",
		testMarksEveryCheckpointIncludingTheInitialOneStaleOnAnEffortChange,
	);
});
