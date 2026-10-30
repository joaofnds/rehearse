import { describe, expect, it } from "bun:test";

import { z } from "zod";

import type { SessionCase } from "#benchmark/case";
import type { SessionSettings } from "#benchmark/claude";
import { jsonObjectSchema } from "#benchmark/json-value";
import type { SessionAttempt } from "#benchmark/session-attempt";
import {
	buildSessionAttemptRecord,
	parseSessionAttemptRecord,
} from "#benchmark/session-record";

import {
	EXPECTED_CONTEXT_READS,
	manifestContextInputs,
	observedContextInputs,
} from "./session-record-context-test-fixtures";
import {
	FIRST_CONTEXT_MANIFEST_PATH_INDEX,
	SECOND_CONTEXT_MANIFEST_PATH_INDEX,
	SHA256_HEX_CHARACTERS,
	STATE_GRADING_SESSION_RECORD_VERSION,
	recordInputs,
	sessionCaseWithContext,
	settingsRecordInputs,
	smokeAttempt,
	smokeCase,
} from "./session-record-test-fixtures";

function buildsessionattemptrecordProducesASchemaVersion3RecordThatRoundtripsWithHalfOnManifestAndDivergenceEntries(): void {
	const expectedSchemaVersion = 3;
	const expectedSpendCeilingUsd = 7.5;

	const built = buildSessionAttemptRecord(manifestContextInputs());

	expect(built.schemaVersion).toBe(expectedSchemaVersion);
	expect(built.contextManifest?.paths).toEqual([
		{ half: "corpus", path: "skills/verify/SKILL.md" },
		{ half: "project", path: "NOTES.md" },
	]);
	expect(built.divergences).toEqual([]);
	expect(built.spendCeilingUsd).toBe(expectedSpendCeilingUsd);
}

function roundtripsContextHalfTags(): void {
	const expectedSchemaVersion = 3;
	const built = buildSessionAttemptRecord(manifestContextInputs());
	const roundtripped = parseSessionAttemptRecord(JSON.stringify(built));

	expect(roundtripped).toEqual(built);
	expect(roundtripped.schemaVersion).toBe(expectedSchemaVersion);
	if (roundtripped.schemaVersion === STATE_GRADING_SESSION_RECORD_VERSION) {
		expect(
			roundtripped.contextManifest?.paths[FIRST_CONTEXT_MANIFEST_PATH_INDEX]
				?.half,
		).toBe("corpus");
		expect(
			roundtripped.contextManifest?.paths[SECOND_CONTEXT_MANIFEST_PATH_INDEX]
				?.half,
		).toBe("project");
	}
}

function buildsessionattemptrecordRecordsWhatTheAttemptDeclaredAndLoadedWithRolesAndStartingHashes(): void {
	const built = buildSessionAttemptRecord(observedContextInputs());

	expect(built).toMatchObject({ schemaVersion: 3 });
	expect("readManifest" in built && built.readManifest).toEqual(
		EXPECTED_CONTEXT_READS,
	);
	expect(parseSessionAttemptRecord(JSON.stringify(built))).toEqual(built);
}

function recordsASettingsDigestThatDistinguishesTwoArmsDifferingOnlyInSettings(): void {
	const withBrief = buildSessionAttemptRecord(
		recordInputs({
			sessionCase: { ...smokeCase(), settings: { outputStyle: "brief" } },
		}),
	);
	const withVerbose = buildSessionAttemptRecord(
		recordInputs({
			sessionCase: { ...smokeCase(), settings: { outputStyle: "verbose" } },
		}),
	);
	const withNone = buildSessionAttemptRecord(recordInputs({}));

	expect(withBrief.settingsDigest).toMatch(/^[0-9a-f]{64}$/u);
	expect(withBrief.settingsDigest).not.toBe(withVerbose.settingsDigest);
	expect(withNone.settingsDigest).toBeUndefined();
	expect(parseSessionAttemptRecord(JSON.stringify(withBrief))).toEqual(
		withBrief,
	);
}

function distinguishesANestedSettingsDifferenceAndIgnoresKeyOrder(): void {
	const permitted = buildSessionAttemptRecord(
		settingsRecordInputs({
			outputStyle: "brief",
			permissions: { allow: ["Edit"] },
		}),
	).settingsDigest;
	const denied = buildSessionAttemptRecord(
		settingsRecordInputs({
			outputStyle: "brief",
			permissions: { allow: [] },
		}),
	).settingsDigest;
	const reorderedSettings = jsonObjectSchema.parse(
		JSON.parse('{"permissions":{"allow":["Edit"]},"outputStyle":"brief"}'),
	);
	const reordered = buildSessionAttemptRecord(
		settingsRecordInputs(reorderedSettings),
	).settingsDigest;
	const nestedReorderedSettings = jsonObjectSchema.parse(
		JSON.parse(
			'{"outputStyle":"brief","permissions":{"deny":[],"allow":["Edit"]}}',
		),
	);
	const nestedReordered = buildSessionAttemptRecord(
		settingsRecordInputs(nestedReorderedSettings),
	).settingsDigest;
	const nestedDeclarationOrder = buildSessionAttemptRecord(
		settingsRecordInputs({
			outputStyle: "brief",
			permissions: { allow: ["Edit"], deny: [] },
		}),
	).settingsDigest;

	expect(permitted).not.toBe(denied);
	expect(permitted).toBe(reordered);
	expect(nestedReordered).toBe(nestedDeclarationOrder);
}

function rejectsManifestEntriesThatAreBareStringsWhenBuildingASessionAttemptRecordRatherThanSpreadingThemIntoCharacterIndices(): void {
	const sampleCase: SessionCase = sessionCaseWithContext(
		[],
		[],
		"Reply with the single word OK.",
	);
	const sampleSettings: SessionSettings = {
		budgetUsd: 0.2,
		model: "haiku",
	};
	const sampleAttempt: SessionAttempt = {
		...smokeAttempt(),
		contextManifest: {
			paths: [{ half: "corpus", path: "output-styles/brief.md" }],
		},
	};
	Reflect.set(sampleAttempt, "contextManifest", {
		paths: ["output-styles/brief.md"],
	});

	expect(() =>
		buildSessionAttemptRecord(
			recordInputs({
				attempt: sampleAttempt,
				elapsedMs: 123,
				sessionCase: sampleCase,
				settings: sampleSettings,
			}),
		),
	).toThrow(z.ZodError);
}
const RAN_SETUP = {
	hookEvents: ["SessionStart"],
	kind: "actual",
	mcpConfigSha256: "c".repeat(SHA256_HEX_CHARACTERS),
	mcpServers: ["tracker"],
	plugins: ["kept@market"],
	settingsKeys: ["hooks", "outputStyle"],
	settingsSha256: "d".repeat(SHA256_HEX_CHARACTERS),
} as const;

function recordsTheSetupTheAttemptRanWith(): void {
	const built = buildSessionAttemptRecord(
		recordInputs({ attempt: { ...smokeAttempt(), setup: RAN_SETUP } }),
	);

	expect(parseSessionAttemptRecord(JSON.stringify(built))).toMatchObject({
		setup: RAN_SETUP,
	});
}

describe("sessionAttemptRecordSchema", () => {
	it(
		"records the setup the attempt ran with",
		recordsTheSetupTheAttemptRanWith,
	);
	it(
		"buildSessionAttemptRecord produces a schemaVersion 3 record that roundtrips with half on manifest and divergence entries",
		buildsessionattemptrecordProducesASchemaVersion3RecordThatRoundtripsWithHalfOnManifestAndDivergenceEntries,
	);
	it(
		"buildSessionAttemptRecord records what the attempt declared and loaded, with roles and starting hashes",
		buildsessionattemptrecordRecordsWhatTheAttemptDeclaredAndLoadedWithRolesAndStartingHashes,
	);
	it(
		"records a settings digest that distinguishes two arms differing only in settings",
		recordsASettingsDigestThatDistinguishesTwoArmsDifferingOnlyInSettings,
	);
	it(
		"distinguishes a nested settings difference and ignores key order",
		distinguishesANestedSettingsDifferenceAndIgnoresKeyOrder,
	);
	it(
		"roundtrips context half tags through the persisted record",
		roundtripsContextHalfTags,
	);
	it(
		"rejects manifest entries that are bare strings when building a session attempt record rather than spreading them into character indices",
		rejectsManifestEntriesThatAreBareStringsWhenBuildingASessionAttemptRecordRatherThanSpreadingThemIntoCharacterIndices,
	);
});
