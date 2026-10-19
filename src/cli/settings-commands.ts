import { EXIT_CODES } from "#benchmark/exit-codes";
import type { CommandEntry, CommandInvocation } from "#cli/command-contract";
import { flagValue, jsonFlag } from "#cli/command-flags";
import { processOutput } from "#cli/output";
import runSettings from "#cli/settings-command";

async function executeSettings({
	commandLine,
	runsDirectory,
}: CommandInvocation): Promise<number> {
	await runSettings(
		{
			json: commandLine.json,
			linkCorpus: flagValue(commandLine.flags, "--link-corpus"),
			runsDirectory,
			spendCeilingUsd: flagValue(commandLine.flags, "--spend-ceiling-usd"),
			unlinkCorpus: commandLine.flags.includes("--unlink-corpus"),
		},
		processOutput,
	);

	return EXIT_CODES.completed;
}
const settingsCommands: readonly CommandEntry[] = [
	{
		definition: {
			confinement: "never",
			flags: [
				{
					help: "The most a run, replay or session attempt may spend in USD; a confirmation group may spend its attempts times this",
					kind: "value",
					name: "--spend-ceiling-usd",
				},
				{
					help: "Directory in corpus layout that commands measure when no --corpus is given; a pipeline run refuses while one is linked",
					kind: "value",
					name: "--link-corpus",
				},
				{
					help: "Remove the linked corpus, so the live install is measured again",
					kind: "switch",
					name: "--unlink-corpus",
				},
				jsonFlag,
			],
			name: "settings",
			summary:
				"Show the stored spend ceiling, the linked corpus and the records location, or store a new ceiling or link",
		},
		execute: executeSettings,
	},
];
export { settingsCommands as default };
