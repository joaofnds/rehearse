import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Immutable } from "#benchmark/contracts";
import type { JsonObject } from "#benchmark/json-value";
import { prepareActualSetup } from "#benchmark/session-setup";

const SHA256_HEX = /^[0-9a-f]{64}$/u;

const SENTINEL = "sentinel-7f3a9c-never-recorded";

let home = "";
let setupDirectory = "";

async function writeJson(
	path: string,
	value: Immutable<JsonObject>,
): Promise<void> {
	await mkdir(join(path, ".."), { recursive: true });
	await writeFile(path, JSON.stringify(value));
}

async function seedUserSetup(): Promise<void> {
	await writeJson(join(home, ".claude", "settings.json"), {
		effortLevel: "max",
		enabledPlugins: { "kept@market": true, "off@market": false },
		env: { API_TOKEN: SENTINEL },
		hooks: { SessionStart: [{ hooks: [] }] },
		model: "opus",
		permissions: { deny: ["Bash(rm:*)"] },
	});
	await writeJson(join(home, ".claude.json"), {
		mcpServers: { tracker: { command: SENTINEL } },
		oauthAccount: { emailAddress: SENTINEL },
	});
	await writeJson(
		join(
			home,
			".claude",
			"plugins",
			"synced",
			"bucket",
			"synced-plugin~g2",
			".claude-plugin",
			"plugin.json",
		),
		{ name: "synced-plugin" },
	);
}

async function setUp(): Promise<void> {
	home = await mkdtemp(join(tmpdir(), "rehearse-setup-home-"));
	setupDirectory = await mkdtemp(join(tmpdir(), "rehearse-setup-files-"));
}

async function tearDown(): Promise<void> {
	await rm(home, { force: true, recursive: true });
	await rm(setupDirectory, { force: true, recursive: true });
}

async function writesTheMergedSettingsIntoTheSetupDirectory(): Promise<void> {
	await seedUserSetup();

	const { files } = await prepareActualSetup({
		declared: { outputStyle: "brief" },
		directory: setupDirectory,
		env: {},
		home,
	});

	expect(files.settingsFile.startsWith(setupDirectory)).toBe(true);
	expect(JSON.parse(await readFile(files.settingsFile, "utf8"))).toMatchObject({
		env: { API_TOKEN: SENTINEL },
		outputStyle: "brief",
	});
}

async function pointsAtTheUserMCPConfigurationAndSyncedPlugins(): Promise<void> {
	await seedUserSetup();

	const { files } = await prepareActualSetup({
		declared: {},
		directory: setupDirectory,
		env: {},
		home,
	});

	expect(files).toMatchObject({
		mcpConfigFiles: [join(home, ".claude.json")],
		pluginDirectories: [join(home, ".claude", "plugins", "synced", "bucket")],
	});
}

async function recordsTheSetupAsNamesAndDigests(): Promise<void> {
	await seedUserSetup();

	const { record } = await prepareActualSetup({
		declared: { outputStyle: "brief" },
		directory: setupDirectory,
		env: {},
		home,
	});
	const { mcpConfigSha256, settingsSha256, ...names } = record;

	expect(mcpConfigSha256).toMatch(SHA256_HEX);
	expect(settingsSha256).toMatch(SHA256_HEX);
	expect(names).toEqual({
		hookEvents: ["SessionStart"],
		kind: "actual",
		mcpServers: ["tracker"],
		plugins: ["kept@market", "synced-plugin"],
		settingsKeys: [
			"enabledPlugins",
			"env",
			"hooks",
			"outputStyle",
			"permissions",
		],
	});
}

async function recordsNoSettingValue(): Promise<void> {
	await seedUserSetup();

	const { record } = await prepareActualSetup({
		declared: {},
		directory: setupDirectory,
		env: {},
		home,
	});

	expect(JSON.stringify(record)).not.toContain(SENTINEL);
}

async function passesNoMCPConfigurationWhenTheUserFileDeclaresNoServers(): Promise<void> {
	await writeJson(join(home, ".claude.json"), { numStartups: 3 });

	const { files } = await prepareActualSetup({
		declared: {},
		directory: setupDirectory,
		env: {},
		home,
	});

	expect(files.mcpConfigFiles).toEqual([]);
}

async function namesThePluginsTheInheritedPluginVariableLoads(): Promise<void> {
	const plugin = join(home, "mods", "env-plugin");
	await writeJson(join(plugin, ".claude-plugin", "plugin.json"), {
		name: "env-plugin",
	});

	const { record } = await prepareActualSetup({
		declared: {},
		directory: setupDirectory,
		env: { CLAUDE_CODE_PLUGIN_DIRS: plugin },
		home,
	});

	expect(record.plugins).toEqual(["env-plugin"]);
}

async function skipsAPluginWhoseManifestIsMalformed(): Promise<void> {
	const plugin = join(home, "mods", "broken-plugin");
	await mkdir(join(plugin, ".claude-plugin"), { recursive: true });
	await writeFile(join(plugin, ".claude-plugin", "plugin.json"), "{");

	const { record } = await prepareActualSetup({
		declared: {},
		directory: setupDirectory,
		env: { CLAUDE_CODE_PLUGIN_DIRS: plugin },
		home,
	});

	expect(record.plugins).toEqual([]);
}

async function runsWithTheDeclaredKeysAloneWhenTheUserHasNoSetup(): Promise<void> {
	const { files, record } = await prepareActualSetup({
		declared: { outputStyle: "brief" },
		directory: setupDirectory,
		env: {},
		home,
	});

	expect(files).toMatchObject({ mcpConfigFiles: [], pluginDirectories: [] });
	expect(record).toMatchObject({
		mcpServers: [],
		plugins: [],
		settingsKeys: ["outputStyle"],
	});
}

describe(prepareActualSetup.name, () => {
	beforeEach(setUp);
	afterEach(tearDown);

	it(
		"writes the merged settings into the setup directory",
		writesTheMergedSettingsIntoTheSetupDirectory,
	);
	it(
		"points at the user MCP configuration and synced plugins",
		pointsAtTheUserMCPConfigurationAndSyncedPlugins,
	);
	it(
		"records the setup as names and digests",
		recordsTheSetupAsNamesAndDigests,
	);
	it("records no setting value", recordsNoSettingValue);
	it(
		"passes no MCP configuration when the user file declares no servers",
		passesNoMCPConfigurationWhenTheUserFileDeclaresNoServers,
	);
	it(
		"names the plugins the inherited plugin variable loads",
		namesThePluginsTheInheritedPluginVariableLoads,
	);
	it(
		"skips a plugin whose manifest is malformed",
		skipsAPluginWhoseManifestIsMalformed,
	);
	describe("when the user has no setup", () => {
		it(
			"runs with the declared keys alone",
			runsWithTheDeclaredKeysAloneWhenTheUserHasNoSetup,
		);
	});
});
