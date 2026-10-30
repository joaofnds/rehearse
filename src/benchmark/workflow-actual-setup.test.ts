import { describe, expect, it } from "bun:test";
import { exists, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { runWorkflowStage } from "./workflow";
import { testResources, workflowStageRequest } from "./workflow-test-fixtures";

testResources.registerCleanup();

const OPTION_VALUE_POSITION_OFFSET = 1;

function optionValue(
	command: readonly string[],
	option: string,
): string | undefined {
	return command[command.indexOf(option) + OPTION_VALUE_POSITION_OFFSET];
}

async function userHome(): Promise<string> {
	const home = await testResources.createTemporaryDirectory(
		"rehearse-stage-home-",
	);
	await mkdir(join(home, ".claude", "plugins", "synced", "bucket"), {
		recursive: true,
	});
	await writeFile(
		join(home, ".claude", "settings.json"),
		JSON.stringify({ hooks: { SessionStart: [] }, theme: "dark" }),
	);
	await writeFile(
		join(home, ".claude.json"),
		JSON.stringify({ mcpServers: { notes: { command: "notes" } } }),
	);

	return home;
}

interface ObservedCall {
	readonly command: readonly string[];
	readonly settingsText: string;
}

async function runsAStageSessionWithTheUserSActualSetup(): Promise<void> {
	const home = await userHome();
	const calls: ObservedCall[] = [];

	await runWorkflowStage(
		workflowStageRequest({
			settingsOverlay: '{"disableAllHooks":false}',
			setup: "actual",
		}),
		async (command) => {
			const settingsFile = optionValue(command, "--settings") ?? "";
			calls.push({
				command,
				settingsText: await readFile(settingsFile, "utf8"),
			});

			return JSON.stringify({
				session_id: "worker-session",
				structured_output: { message: "Built", status: "COMPLETE" },
				type: "result",
			});
		},
		home,
	);
	const [call] = calls;
	const settingsFile = optionValue(call?.command ?? [], "--settings") ?? "";

	expect(optionValue(call?.command ?? [], "--setting-sources")).toBe(
		"project,local",
	);
	expect(optionValue(call?.command ?? [], "--mcp-config")).toBe(
		join(home, ".claude.json"),
	);
	expect(optionValue(call?.command ?? [], "--plugin-dir")).toBe(
		join(home, ".claude", "plugins", "synced", "bucket"),
	);
	expect(JSON.parse(call?.settingsText ?? "")).toEqual({
		disableAllHooks: false,
		hooks: { SessionStart: [] },
		theme: "dark",
	});
	expect(await exists(settingsFile)).toBe(false);
}

describe(runWorkflowStage.name, () => {
	it(
		"runs a stage session with the user's actual setup",
		runsAStageSessionWithTheUserSActualSetup,
	);
});
