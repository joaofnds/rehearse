import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Immutable } from "#benchmark/contracts";
import type { JsonObject } from "#benchmark/json-value";
import { prepareActualSetup } from "#benchmark/session-setup";
import type { ActualSetupRecord } from "#benchmark/session-setup";

const temporaryDirectories = new Set<string>();

async function temporary(prefix: string): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), prefix));
	temporaryDirectories.add(directory);

	return directory;
}

interface UserFiles {
	readonly settings: Immutable<JsonObject>;
	readonly claudeJson: Immutable<JsonObject>;
}

async function recordFor({
	settings,
	claudeJson,
}: UserFiles): Promise<ActualSetupRecord> {
	const home = await temporary("rehearse-digest-home-");
	await mkdir(join(home, ".claude"));
	await writeFile(
		join(home, ".claude", "settings.json"),
		JSON.stringify(settings),
	);
	await writeFile(join(home, ".claude.json"), JSON.stringify(claudeJson));
	const { record } = await prepareActualSetup({
		declared: {},
		directory: await temporary("rehearse-digest-files-"),
		home,
	});

	return record;
}

const SERVERS = { mcpServers: { tracker: { command: "tracker" } } };

async function ignoresWhatClaudeCodeRewritesBesideTheServers(): Promise<void> {
	const before = await recordFor({
		claudeJson: { ...SERVERS, numStartups: 1 },
		settings: {},
	});
	const after = await recordFor({
		claudeJson: { ...SERVERS, numStartups: 2 },
		settings: {},
	});

	expect(after.mcpConfigSha256).toBe(before.mcpConfigSha256);
}

async function changesWhenAServerChanges(): Promise<void> {
	const before = await recordFor({ claudeJson: SERVERS, settings: {} });
	const after = await recordFor({
		claudeJson: { mcpServers: { tracker: { command: "other" } } },
		settings: {},
	});

	expect(after.mcpConfigSha256).not.toBe(before.mcpConfigSha256);
}

async function changesWhenASettingValueChanges(): Promise<void> {
	const before = await recordFor({
		claudeJson: SERVERS,
		settings: { theme: "dark" },
	});
	const after = await recordFor({
		claudeJson: SERVERS,
		settings: { theme: "light" },
	});

	expect(after.settingsSha256).not.toBe(before.settingsSha256);
}

async function tearDown(): Promise<void> {
	const directories = [...temporaryDirectories];
	temporaryDirectories.clear();
	await Promise.all(
		directories.map(async (directory) => {
			await rm(directory, { force: true, recursive: true });
		}),
	);
}

describe(prepareActualSetup.name, () => {
	beforeEach(tearDown);
	afterEach(tearDown);

	describe("its MCP configuration digest", () => {
		it(
			"ignores what Claude Code rewrites beside the servers",
			ignoresWhatClaudeCodeRewritesBesideTheServers,
		);
		it("changes when a server changes", changesWhenAServerChanges);
	});
	describe("its settings digest", () => {
		it("changes when a setting value changes", changesWhenASettingValueChanges);
	});
});
