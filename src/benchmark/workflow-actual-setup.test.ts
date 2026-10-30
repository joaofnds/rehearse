import { describe, expect, it } from "bun:test";
import { exists, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import StageSessionError from "./stage-session-error";
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

async function stageFailureOf(
	running: Promise<unknown>,
): Promise<StageSessionError | undefined> {
	try {
		await running;
		return undefined;
	} catch (error) {
		if (error instanceof StageSessionError) {
			return error;
		}

		throw error;
	}
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

async function reportsAnUnreadableSetupAsAStageFailureThatSpentNothing(): Promise<void> {
	const home = await userHome();
	await writeFile(join(home, ".claude", "settings.json"), "{");

	const failure = await stageFailureOf(
		runWorkflowStage(
			workflowStageRequest({ setup: "actual" }),
			async () => await Promise.reject(new Error("claude never runs")),
			home,
		),
	);

	expect(failure).toMatchObject({ costUsd: 0, providerCalls: [] });
}

async function removesTheMergedSettingsWhenTheSessionFails(): Promise<void> {
	const home = await userHome();
	const settingsFiles: string[] = [];

	const failure = await stageFailureOf(
		runWorkflowStage(
			workflowStageRequest({ setup: "actual" }),
			async (command) => {
				settingsFiles.push(optionValue(command, "--settings") ?? "");

				return await Promise.reject(new Error("session crashed"));
			},
			home,
		),
	);
	const [settingsFile = ""] = settingsFiles;

	expect(failure).toBeInstanceOf(StageSessionError);
	expect(settingsFile).not.toBe("");
	expect(await exists(settingsFile)).toBe(false);
}

describe(runWorkflowStage.name, () => {
	it(
		"runs a stage session with the user's actual setup",
		runsAStageSessionWithTheUserSActualSetup,
	);
	it(
		"removes the merged settings when the session fails",
		removesTheMergedSettingsWhenTheSessionFails,
	);
	it(
		"reports an unreadable setup as a stage failure that spent nothing",
		reportsAnUnreadableSetupAsAStageFailureThatSpentNothing,
	);
});
