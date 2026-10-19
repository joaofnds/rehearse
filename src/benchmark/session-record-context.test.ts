import { describe, expect, it } from "bun:test";

import {
	parseSessionAttemptRecord,
	sessionAttemptRecordSchema,
} from "#benchmark/session-record";

import {
	FIRST_RECORDED_DIVERGENCE_INDEX,
	GIT_SHA_HEX_CHARACTERS,
	record,
} from "./session-record-test-fixtures";

function carriesADirectoryOriginSSource(): void {
	expect(
		sessionAttemptRecordSchema.parse(
			record({ corpusOrigin: { kind: "directory", source: "/corpus" } }),
		).corpusOrigin,
	).toEqual({ kind: "directory", source: "/corpus" });
}

function acceptsARecordWrittenBeforeTheOriginExisted(): void {
	const { corpusOrigin: _dropped, ...legacy } = record();

	expect(sessionAttemptRecordSchema.parse(legacy).corpusOrigin).toBeUndefined();
}

function carriesTheObservedContextManifestSPaths(): void {
	expect(
		sessionAttemptRecordSchema.parse(
			record({
				contextManifest: {
					paths: [{ half: "corpus", path: "skills/verify/SKILL.md" }],
				},
				divergences: [],
			}),
		).contextManifest,
	).toEqual({ paths: [{ half: "corpus", path: "skills/verify/SKILL.md" }] });
}

function carriesANamedDivergenceBetweenTheManifestAndTheDeclaration(): void {
	expect(
		sessionAttemptRecordSchema.parse(
			record({
				contextManifest: { paths: [] },
				divergences: [
					{
						half: "corpus",
						kind: "unloaded-file",
						path: "skills/verify/SKILL.md",
					},
				],
			}),
		).divergences,
	).toEqual([
		{ half: "corpus", kind: "unloaded-file", path: "skills/verify/SKILL.md" },
	]);
}

function acceptsARecordWrittenBeforeTheContextManifestExisted(): void {
	const parsed = sessionAttemptRecordSchema.parse(record());

	expect(parsed.contextManifest).toBeUndefined();
	expect(parsed.divergences).toBeUndefined();
}

function refusesADivergenceNamingAKindThatDoesNotExist(): void {
	const parsed = sessionAttemptRecordSchema.safeParse({
		...record({ contextManifest: { paths: [] } }),
		divergences: [
			{
				half: "corpus",
				kind: "renamed-file",
				path: "skills/verify/SKILL.md",
			},
		],
	});

	expect(parsed.success).toBe(false);
}

function carriesAProjectHalfDivergenceSHalfTagThroughTheRecord(): void {
	expect(
		sessionAttemptRecordSchema.parse(
			record({
				contextManifest: { paths: [] },
				divergences: [
					{ half: "project", kind: "unloaded-file", path: "NOTES.md" },
				],
			}),
		).divergences,
	).toEqual([{ half: "project", kind: "unloaded-file", path: "NOTES.md" }]);
}

function refusesAnOriginNamingAKindThatDoesNotExist(): void {
	const parsed = sessionAttemptRecordSchema.safeParse({
		...record(),
		corpusOrigin: {
			commit: "0".repeat(GIT_SHA_HEX_CHARACTERS),
			kind: "rendered",
			ref: "HEAD",
		},
	});

	expect(parsed.success).toBe(false);
}

function parsesALegacyPreACT61RecordWhoseManifestEntriesAreBareStringsAndDivergencesCarryNoHalfRetainingExactBytesWithoutAddingOrDefaultingHalf(): void {
	const expectedSchemaVersion = 1;

	const legacyRaw = {
		...record(),
		contextManifest: {
			paths: ["output-styles/brief.md"],
		},
		divergences: [
			{
				kind: "unloaded-file",
				path: "CLAUDE.md",
			},
		],
		schemaVersion: 1,
	};
	const parsed = parseSessionAttemptRecord(JSON.stringify(legacyRaw));

	expect(parsed.schemaVersion).toBe(expectedSchemaVersion);
	expect(parsed.contextManifest).toEqual({
		paths: ["output-styles/brief.md"],
	});
	expect(parsed.divergences).toEqual([
		{
			kind: "unloaded-file",
			path: "CLAUDE.md",
		},
	]);
	expect(
		"half" in (parsed.divergences?.[FIRST_RECORDED_DIVERGENCE_INDEX] ?? {}),
	).toBe(false);
}
describe("sessionAttemptRecordSchema", () => {
	it("carries a directory origin's source", carriesADirectoryOriginSSource);
	it(
		"accepts a record written before the origin existed",
		acceptsARecordWrittenBeforeTheOriginExisted,
	);
	it(
		"carries the observed context manifest's paths",
		carriesTheObservedContextManifestSPaths,
	);
	it(
		"carries a named divergence between the manifest and the declaration",
		carriesANamedDivergenceBetweenTheManifestAndTheDeclaration,
	);
	it(
		"accepts a record written before the context manifest existed",
		acceptsARecordWrittenBeforeTheContextManifestExisted,
	);
	it(
		"refuses a divergence naming a kind that does not exist",
		refusesADivergenceNamingAKindThatDoesNotExist,
	);
	it(
		"carries a project-half divergence's half tag through the record",
		carriesAProjectHalfDivergenceSHalfTagThroughTheRecord,
	);
	it(
		"refuses an origin naming a kind that does not exist",
		refusesAnOriginNamingAKindThatDoesNotExist,
	);
	it(
		"parses a legacy pre-ACT-61 record whose manifest entries are bare strings and divergences carry no half, retaining exact bytes without adding or defaulting half",
		parsesALegacyPreACT61RecordWhoseManifestEntriesAreBareStringsAndDivergencesCarryNoHalfRetainingExactBytesWithoutAddingOrDefaultingHalf,
	);
});
