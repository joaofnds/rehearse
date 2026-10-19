import { describe, expect, it } from "bun:test";
import { chmod, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import { CONTROL_DIR } from "./config";
import { loadStageSettings, stageSettingsSchema } from "./stage-settings";
import { TestResources } from "./test-support";

const UNREADABLE_FILE_MODE = 0;
const NUL_CODE_POINT = 0;

const OWNER_FILE_MODE = 0o600;

const FIXTURE_JSON_INDENT_SPACES = 2;

const testResources = TestResources.forEachTest();

const stageSettingsSchemaAcceptsAPermissionsDenyListAndFeatureSwitches =
	(): void => {
		const result = stageSettingsSchema.safeParse({
			disableAllHooks: true,
			permissions: { deny: ["Bash(rm *)"] },
		});

		expect(result.success).toBe(true);
	};

const stageSettingsSchemaAcceptsAnEmptyObject = (): void => {
	expect(stageSettingsSchema.safeParse({}).success).toBe(true);
};

const stageSettingsSchemaRejectsAHooksKey = (): void => {
	const result = stageSettingsSchema.safeParse({ hooks: {} });

	expect(result.success).toBe(false);
};

const stageSettingsSchemaRejectsAKeyItDoesNotDeclare = (): void => {
	const result = stageSettingsSchema.safeParse({ statusLine: "custom" });

	expect(result.success).toBe(false);
};

describe("stageSettingsSchema", () => {
	it(
		"accepts a permissions deny list and feature switches",
		stageSettingsSchemaAcceptsAPermissionsDenyListAndFeatureSwitches,
	);

	it("accepts an empty object", stageSettingsSchemaAcceptsAnEmptyObject);

	it("rejects a hooks key", stageSettingsSchemaRejectsAHooksKey);

	it(
		"rejects a key it does not declare",
		stageSettingsSchemaRejectsAKeyItDoesNotDeclare,
	);
});

const loadStageSettingsPreservesTheHistoricalCanonicalSettingsBytesAndLineageHash =
	async (): Promise<void> => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-settings-"));
		testResources.track(directory);
		const path = join(directory, "settings.json");
		const expected =
			'{"permissions":{"deny":["Bash(git branch *)","Bash(git checkout -b *)","Bash(git switch -c *)","Bash(git worktree add *)"]},"disableBundledSkills":true}';
		await Bun.write(path, expected);

		const loaded = await loadStageSettings(path);

		expect(loaded.json).toBe(expected);
		expect(loaded.hashed.sha256).toBe(
			"11bda72f64c6c59c496abb5b31235a06ec175263636d6cfae134256c99fc365d",
		);
	};

const loadStageSettingsReportsAnInvalidPermissionPolicyBeforeInvalidFeatureSwitches =
	async (): Promise<void> => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-settings-"));
		testResources.track(directory);
		const path = join(directory, "settings.json");
		await Bun.write(path, '{"permissions":7,"disableAllHooks":7}');

		const failure = await failureOf(loadStageSettings(path));

		expect(failure.message).toBe(
			`Stage settings file ${path} has an invalid permissions: Invalid input: expected object, received number`,
		);
	};

const loadStageSettingsRecordsAControlrelativeSettingsIdentity =
	async (): Promise<void> => {
		const directory = await mkdtemp(join(CONTROL_DIR, ".rehearse-settings-"));
		testResources.track(directory);
		const path = join(directory, "settings.json");
		await Bun.write(path, "{}");

		const loaded = await loadStageSettings(path);

		expect(loaded.hashed.path).toBe(relative(CONTROL_DIR, path));
	};

const loadStageSettingsReadsHashesAndReserializesTheDeclaredFilesBytes =
	async (): Promise<void> => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-settings-"));
		testResources.track(directory);
		const path = join(directory, "settings.json");
		const content = { permissions: { deny: ["Bash(rm *)"] } };
		await Bun.write(path, JSON.stringify(content));

		const loaded = await loadStageSettings(path);

		expect(JSON.parse(loaded.json)).toEqual(content);
		expect(loaded.hashed.sha256).toBe(
			new Bun.CryptoHasher("sha256").update(loaded.json).digest("hex"),
		);
	};

const loadStageSettingsHashesTheSameDigestForTwoFilesThatDifferOnlyInWhitespace =
	async (): Promise<void> => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-settings-"));
		testResources.track(directory);
		const compact = join(directory, "compact.json");
		const spaced = join(directory, "spaced.json");
		const content = { permissions: { deny: ["Bash(rm *)"] } };
		await Bun.write(compact, JSON.stringify(content));
		await Bun.write(
			spaced,
			JSON.stringify(content, null, FIXTURE_JSON_INDENT_SPACES),
		);

		const [loadedCompact, loadedSpaced] = await Promise.all([
			loadStageSettings(compact),
			loadStageSettings(spaced),
		]);

		expect(loadedSpaced.hashed.sha256).toBe(loadedCompact.hashed.sha256);
	};

const loadStageSettingsRefusesASettingsFileThatFailsTheSchema =
	async (): Promise<void> => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-settings-"));
		testResources.track(directory);
		const path = join(directory, "settings.json");
		await Bun.write(path, JSON.stringify({ hooks: {} }));

		expect(loadStageSettings(path)).rejects.toThrow(/invalid/u);
	};

const loadStageSettingsRefusesASettingsFileThatIsNotValidJSON =
	async (): Promise<void> => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-settings-"));
		testResources.track(directory);
		const path = join(directory, "settings.json");
		await Bun.write(path, "not json");

		expect(loadStageSettings(path)).rejects.toThrow(/not valid JSON/u);
	};

const loadStageSettingsRefusesAPathWithNoFileNamingIt =
	async (): Promise<void> => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-settings-"));
		testResources.track(directory);
		const path = join(directory, "missing.json");

		expect(loadStageSettings(path)).rejects.toThrow(
			new RegExp(`No stage settings file at ${path}.*settingsFile`, "u"),
		);
	};

const loadStageSettingsTranslatesAnUnreadableFileIntoASettingsRefusal =
	async (): Promise<void> => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-settings-"));
		testResources.track(directory);
		const path = join(directory, "settings.json");
		await Bun.write(path, "{}");
		await chmod(path, UNREADABLE_FILE_MODE);

		try {
			const failure = await failureOf(loadStageSettings(path));
			expect(failure).toHaveProperty(
				"message",
				expect.stringMatching(`Cannot read stage settings file ${path}`),
			);
		} finally {
			await chmod(path, OWNER_FILE_MODE);
		}
	};

const loadStageSettingsTranslatesAnInvalidFilesystemPathIntoASettingsRefusal =
	(): void => {
		const path = `settings${String.fromCodePoint(NUL_CODE_POINT)}.json`;

		expect(loadStageSettings(path)).rejects.toThrow(
			/Cannot read stage settings file/u,
		);
	};

describe("stage settings identity and canonical bytes", () => {
	it(
		"preserves the historical canonical settings bytes and lineage hash",
		loadStageSettingsPreservesTheHistoricalCanonicalSettingsBytesAndLineageHash,
	);
	it(
		"reports an invalid permission policy before invalid feature switches",
		loadStageSettingsReportsAnInvalidPermissionPolicyBeforeInvalidFeatureSwitches,
	);
	it(
		"records a control-relative settings identity",
		loadStageSettingsRecordsAControlrelativeSettingsIdentity,
	);
	it(
		"reads, hashes, and re-serializes the declared file's bytes",
		loadStageSettingsReadsHashesAndReserializesTheDeclaredFilesBytes,
	);
	it(
		"hashes the same digest for two files that differ only in whitespace",
		loadStageSettingsHashesTheSameDigestForTwoFilesThatDifferOnlyInWhitespace,
	);
});
describe("stage settings refusals", () => {
	it(
		"refuses a settings file that fails the schema",
		loadStageSettingsRefusesASettingsFileThatFailsTheSchema,
	);
	it(
		"refuses a settings file that is not valid JSON",
		loadStageSettingsRefusesASettingsFileThatIsNotValidJSON,
	);
	it(
		"refuses a path with no file, naming it",
		loadStageSettingsRefusesAPathWithNoFileNamingIt,
	);
	it(
		"translates an unreadable file into a settings refusal",
		loadStageSettingsTranslatesAnUnreadableFileIntoASettingsRefusal,
	);
	it(
		"translates an invalid filesystem path into a settings refusal",
		loadStageSettingsTranslatesAnInvalidFilesystemPathIntoASettingsRefusal,
	);
});
