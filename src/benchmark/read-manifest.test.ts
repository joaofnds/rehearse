import { describe, expect, it } from "bun:test";

import { corpusEntries, projectEntries } from "#benchmark/context-manifest";
import { stageReadManifest } from "#benchmark/read-manifest";

import StageReadManifestBuilder from "./stage-read-manifest-test-builder";

const SHA256_HEX_DIGITS = 64;

const stageReadManifestGivesEachFileTheStageDeclaredOrLoadedOneRoleAndItsRecordedHash =
	(): void => {
		const manifest = stageReadManifest(new StageReadManifestBuilder().build());

		expect(manifest).toEqual([
			{
				evidence: "declared",
				half: "corpus",
				path: "CLAUDE.md",
				role: "global instructions",
				sha256: "a".repeat(SHA256_HEX_DIGITS),
			},
			{
				evidence: "declared and observed",
				half: "corpus",
				path: "skills/shape/SKILL.md",
				role: "stage skill",
				sha256: "b".repeat(SHA256_HEX_DIGITS),
			},
			{
				evidence: "declared",
				half: "rubric",
				path: "rubrics/shape.json",
				role: "judge rubric",
				sha256: "e".repeat(SHA256_HEX_DIGITS),
			},
			{
				evidence: "observed",
				half: "corpus",
				path: "rulebook/style.md",
				role: "read for context",
				sha256: "c".repeat(SHA256_HEX_DIGITS),
			},
			{
				evidence: "observed",
				half: "project",
				path: "CLAUDE.md",
				role: "project instructions",
				sha256: "d".repeat(SHA256_HEX_DIGITS),
			},
		]);
	};

const stageReadManifestLeavesTheHashOutOfATargetFileTheStartingCheckpointDidNotHold =
	(): void => {
		const manifest = stageReadManifest({
			corpusFiles: [],
			observed: { paths: projectEntries(["AGENTS.md"]) },
			rubric: undefined,
			skill: "shape",
			targetFiles: [],
			versionFiles: [],
		});

		expect(manifest).toContainEqual({
			evidence: "observed",
			half: "project",
			path: "AGENTS.md",
			role: "project instructions",
		});
	};

const stageReadManifestHashesACorpusFileTheStageLoadedBeyondItsCapturedFilesFromTheVersionIt =
	(): void => {
		const manifest = stageReadManifest({
			corpusFiles: [
				{
					path: "skills/build/SKILL.md",
					sha256: "a".repeat(SHA256_HEX_DIGITS),
				},
			],
			observed: { paths: corpusEntries(["skills/delivery/SKILL.md"]) },
			rubric: undefined,
			skill: "build",
			targetFiles: [],
			versionFiles: [
				{
					path: "skills/build/SKILL.md",
					sha256: "a".repeat(SHA256_HEX_DIGITS),
				},
				{
					path: "skills/delivery/SKILL.md",
					sha256: "b".repeat(SHA256_HEX_DIGITS),
				},
			],
		});

		expect(manifest).toContainEqual({
			evidence: "observed",
			half: "corpus",
			path: "skills/delivery/SKILL.md",
			role: "read for context",
			sha256: "b".repeat(SHA256_HEX_DIGITS),
		});
	};

describe("stageReadManifest", () => {
	it(
		"gives each file the stage declared or loaded one role and its recorded hash",
		stageReadManifestGivesEachFileTheStageDeclaredOrLoadedOneRoleAndItsRecordedHash,
	);

	it(
		"leaves the hash out of a target file the starting checkpoint did not hold",
		stageReadManifestLeavesTheHashOutOfATargetFileTheStartingCheckpointDidNotHold,
	);

	it(
		"hashes a corpus file the stage loaded beyond its captured files from the version it started at",
		stageReadManifestHashesACorpusFileTheStageLoadedBeyondItsCapturedFilesFromTheVersionIt,
	);
});
