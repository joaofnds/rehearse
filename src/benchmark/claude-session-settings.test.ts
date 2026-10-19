import { describe, expect, it } from "bun:test";

import { claudeArgs } from "./claude";
import { OPTION_VALUE_POSITION_OFFSET } from "./claude-test-fixtures";
import { stageTurnSchema } from "./contracts";

function restrictsAStageSessionToProjectLevelSettings(): void {
	const command = claudeArgs({
		access: "unrestricted",
		schema: stageTurnSchema,
		session: { id: "session-1", resume: false },
		settingSources: "project",
		settings: { budgetUsd: 5, model: "sonnet" },
	});

	expect(command).toContain("--setting-sources");
	expect(
		command[
			command.indexOf("--setting-sources") + OPTION_VALUE_POSITION_OFFSET
		],
	).toBe("project");
}

function omitsSettingSourcesWhenTheInvocationDoesNotRestrictSources(): void {
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
		"restricts a stage session to project-level settings",
		restrictsAStageSessionToProjectLevelSettings,
	);
	it(
		"omits --setting-sources when the invocation does not restrict sources",
		omitsSettingSourcesWhenTheInvocationDoesNotRestrictSources,
	);
	it(
		"passes the declared settings JSON through --settings",
		passesTheDeclaredSettingsJSONThroughSettings,
	);
	it(
		"omits --settings when the invocation carries no settings overlay",
		omitsSettingsWhenTheInvocationCarriesNoSettingsOverlay,
	);
	it(
		"restricts a stage session to project-level settings",
		restrictsAStageSessionToProjectLevelSettings,
	);
	it(
		"omits --setting-sources when the invocation does not restrict sources",
		omitsSettingSourcesWhenTheInvocationDoesNotRestrictSources,
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
