import { describe, expect, it } from "bun:test";

import { sessionCaseArgs } from "#benchmark/session-attempt";

import {
	actualSetup,
	actualSetupOptions,
	sessionCase,
	sessionCaseOptions,
} from "./session-attempt-case-test-fixtures";
import { valueAfter } from "./session-attempt-provider-test-fixtures";

function disablesEveryToolWithAnEmptyToolsForAnEmptyDeclaredList(): void {
	const flags = sessionCaseArgs(sessionCase(), sessionCaseOptions());

	expect(valueAfter(flags, "--tools")).toBe("");
}

function joinsTheDeclaredToolNamesIntoOneToolsValue(): void {
	const flags = sessionCaseArgs(
		sessionCase({ tools: ["Read", "Bash"] }),
		sessionCaseOptions(),
	);

	expect(valueAfter(flags, "--tools")).toBe("Read,Bash");
}

function passesTheDeclaredSettingsAsInlineJSON(): void {
	const flags = sessionCaseArgs(
		sessionCase({ settings: { outputStyle: "brief" } }),
		sessionCaseOptions(),
	);

	expect(valueAfter(flags, "--settings")).toBe('{"outputStyle":"brief"}');
}

function omitsSettingsWhenTheCaseDeclaresNone(): void {
	const flags = sessionCaseArgs(sessionCase(), sessionCaseOptions());

	expect(flags).not.toContain("--settings");
}

function passesTheDeclaredAgentsAsInlineJSON(): void {
	const flags = sessionCaseArgs(
		sessionCase({ agents: { reviewer: { description: "r" } } }),
		sessionCaseOptions(),
	);

	expect(valueAfter(flags, "--agents")).toBe(
		'{"reviewer":{"description":"r"}}',
	);
}

function omitsAgentsWhenTheCaseDeclaresNone(): void {
	const flags = sessionCaseArgs(sessionCase(), sessionCaseOptions());

	expect(flags).not.toContain("--agents");
}

function shutsOutEveryMCPServerTheCaseNeverDeclaredTheClaudeAiAccountSConnectorsIncluded(): void {
	const flags = sessionCaseArgs(sessionCase(), sessionCaseOptions());

	expect(flags).toContain("--strict-mcp-config");
}

function carriesADeclaredFileEditAndCLIPermissionAlongsideTheToolsThatUseThem(): void {
	const flags = sessionCaseArgs(
		sessionCase({
			settings: {
				permissions: { allow: ["Edit", "Bash(./fixture-cli:*)"] },
			},
			tools: ["Edit", "Bash"],
		}),
		sessionCaseOptions(),
	);

	expect(valueAfter(flags, "--tools")).toBe("Edit,Bash");
	expect(valueAfter(flags, "--settings")).toBe(
		'{"permissions":{"allow":["Edit","Bash(./fixture-cli:*)"]}}',
	);
	expect(valueAfter(flags, "--setting-sources")).toBe("project");
}

function excludesTheOperatorSOwnSettingsWithSettingSourcesProject(): void {
	const flags = sessionCaseArgs(sessionCase(), sessionCaseOptions());

	expect(valueAfter(flags, "--setting-sources")).toBe("project");
}

function carriesTheSessionKnobsTheJSONEnvelopeAndTheBudget(): void {
	const flags = sessionCaseArgs(sessionCase(), sessionCaseOptions());

	expect(valueAfter(flags, "--model")).toBe("haiku");
	expect(valueAfter(flags, "--effort")).toBe("low");
	expect(valueAfter(flags, "--max-budget-usd")).toBe("0.2");
	expect(valueAfter(flags, "--output-format")).toBe("json");
}

function carriesTheRunModelAndEffortWithTheActualSetup(): void {
	const flags = sessionCaseArgs(sessionCase(), actualSetupOptions());

	expect(valueAfter(flags, "--model")).toBe("haiku");
	expect(valueAfter(flags, "--effort")).toBe("low");
}

function loadsTheProjectAndLocalSettingSources(): void {
	const flags = sessionCaseArgs(sessionCase(), actualSetupOptions());

	expect(valueAfter(flags, "--setting-sources")).toBe("project,local");
}

function passesTheUserSettingsByPathNeverInline(): void {
	const flags = sessionCaseArgs(
		sessionCase({ settings: { outputStyle: "brief" } }),
		actualSetupOptions(),
	);

	expect(valueAfter(flags, "--settings")).toBe(actualSetup.settingsFile);
}

function passesTheUserMCPConfiguration(): void {
	const flags = sessionCaseArgs(sessionCase(), actualSetupOptions());

	const [mcpConfigFile] = actualSetup.mcpConfigFiles;

	expect(valueAfter(flags, "--mcp-config")).toBe(mcpConfigFile);
}

function loadsEachPluginDirectoryTheUserSetupHolds(): void {
	const flags = sessionCaseArgs(sessionCase(), actualSetupOptions());

	const [pluginDirectory] = actualSetup.pluginDirectories;

	expect(valueAfter(flags, "--plugin-dir")).toBe(pluginDirectory);
}

function leavesTheUserToolsAndMCPServersInPlace(): void {
	const flags = sessionCaseArgs(
		sessionCase({ tools: ["Read"] }),
		actualSetupOptions(),
	);

	expect(flags).not.toContain("--tools");
	expect(flags).not.toContain("--strict-mcp-config");
}

function describeWhenTheSessionRunsWithTheActualSetup(): void {
	it(
		"carries the run's model and effort",
		carriesTheRunModelAndEffortWithTheActualSetup,
	);
	it(
		"loads the project and local setting sources",
		loadsTheProjectAndLocalSettingSources,
	);
	it(
		"passes the user settings by path, never inline",
		passesTheUserSettingsByPathNeverInline,
	);
	it("passes the user MCP configuration", passesTheUserMCPConfiguration);
	it(
		"loads each plugin directory the user setup holds",
		loadsEachPluginDirectoryTheUserSetupHolds,
	);
	it(
		"leaves the user tools and MCP servers in place",
		leavesTheUserToolsAndMCPServersInPlace,
	);
}

function describeWhenTheCaseDeclaresIsolation(): void {
	it(
		"disables every tool with an empty --tools for an empty declared list",
		disablesEveryToolWithAnEmptyToolsForAnEmptyDeclaredList,
	);
	it(
		"joins the declared tool names into one --tools value",
		joinsTheDeclaredToolNamesIntoOneToolsValue,
	);
	it(
		"passes the declared settings as inline JSON",
		passesTheDeclaredSettingsAsInlineJSON,
	);
	it(
		"omits --settings when the case declares none",
		omitsSettingsWhenTheCaseDeclaresNone,
	);
	it(
		"passes the declared agents as inline JSON",
		passesTheDeclaredAgentsAsInlineJSON,
	);
	it(
		"omits --agents when the case declares none",
		omitsAgentsWhenTheCaseDeclaresNone,
	);
	it(
		"shuts out every MCP server the case never declared, the claude.ai account's connectors included",
		shutsOutEveryMCPServerTheCaseNeverDeclaredTheClaudeAiAccountSConnectorsIncluded,
	);
	it(
		"carries a declared file-edit and CLI permission alongside the tools that use them",
		carriesADeclaredFileEditAndCLIPermissionAlongsideTheToolsThatUseThem,
	);
	it(
		"excludes the operator's own settings with --setting-sources project",
		excludesTheOperatorSOwnSettingsWithSettingSourcesProject,
	);
	it(
		"carries the session knobs, the JSON envelope, and the budget",
		carriesTheSessionKnobsTheJSONEnvelopeAndTheBudget,
	);
}

describe(sessionCaseArgs.name, () => {
	describe(
		"when the session runs with the actual setup",
		describeWhenTheSessionRunsWithTheActualSetup,
	);
	describe(
		"when the case declares isolation",
		describeWhenTheCaseDeclaresIsolation,
	);
});
