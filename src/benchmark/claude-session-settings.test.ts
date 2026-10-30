import { describe, expect, it } from "bun:test";

import { claudeArgs } from "./claude";
import { OPTION_VALUE_POSITION_OFFSET } from "./claude-test-fixtures";
import { stageTurnSchema } from "./contracts";

function passesTheActualSetupSFilesInPlaceOfTheOverlay(): void {
	const command = claudeArgs({
		access: "unrestricted",
		schema: stageTurnSchema,
		session: { id: "session-1", resume: false },
		settings: { budgetUsd: 5, model: "sonnet" },
		settingsOverlay: '{"disableAllHooks":true}',
		setup: {
			kind: "actual",
			mcpConfigFiles: ["/home/.claude.json"],
			pluginDirectories: ["/home/.claude/plugins/synced/bucket"],
			settingsFile: "/setup/settings.json",
		},
	});

	expect(command.slice(command.indexOf("--setting-sources"))).toEqual([
		"--setting-sources",
		"project,local",
		"--settings",
		"/setup/settings.json",
		"--mcp-config",
		"/home/.claude.json",
		"--plugin-dir",
		"/home/.claude/plugins/synced/bucket",
	]);
}

function omitsSettingSourcesWhenTheInvocationCarriesNoActualSetup(): void {
	const command = claudeArgs({
		access: "unrestricted",
		schema: stageTurnSchema,
		session: { id: "session-1", resume: false },
		settings: { budgetUsd: 5, model: "sonnet" },
	});

	expect(command).not.toContain("--setting-sources");
}

function passesTheDeclaredSettingsJSONThroughSettings(): void {
	const command = claudeArgs({
		access: "unrestricted",
		schema: stageTurnSchema,
		session: { id: "session-1", resume: false },
		settings: { budgetUsd: 5, model: "sonnet" },
		settingsOverlay: '{"disableAllHooks":true}',
	});

	expect(command).toContain("--settings");
	expect(
		command[command.indexOf("--settings") + OPTION_VALUE_POSITION_OFFSET],
	).toBe('{"disableAllHooks":true}');
}

function omitsSettingsWhenTheInvocationCarriesNoSettingsOverlay(): void {
	const command = claudeArgs({
		access: "unrestricted",
		schema: stageTurnSchema,
		session: { id: "session-1", resume: false },
		settings: { budgetUsd: 5, model: "sonnet" },
	});

	expect(command).not.toContain("--settings");
}

describe(claudeArgs.name, () => {
	it(
		"passes the actual setup's files in place of the overlay",
		passesTheActualSetupSFilesInPlaceOfTheOverlay,
	);
	it(
		"omits --setting-sources when the invocation carries no actual setup",
		omitsSettingSourcesWhenTheInvocationCarriesNoActualSetup,
	);
	it(
		"passes the declared settings JSON through --settings",
		passesTheDeclaredSettingsJSONThroughSettings,
	);
	it(
		"omits --settings when the invocation carries no settings overlay",
		omitsSettingsWhenTheInvocationCarriesNoSettingsOverlay,
	);
});
