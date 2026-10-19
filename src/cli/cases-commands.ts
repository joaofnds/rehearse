import { EXIT_CODES } from "#benchmark/exit-codes";
import { claudeProjectsDirectory } from "#benchmark/session-capture";
import runCaseCapture from "#cli/case-capture-command";
import { runCaseList, runCaseShow } from "#cli/case-command";
import type { CommandEntry, CommandInvocation } from "#cli/command-contract";
import { flagValue, jsonFlag } from "#cli/command-flags";
import { processOutput } from "#cli/output";

async function executeCaseList({
	commandLine,
}: CommandInvocation): Promise<number> {
	await runCaseList(
		{
			includeArchived: commandLine.flags.includes("--all"),
			json: commandLine.json,
		},
		processOutput,
	);

	return EXIT_CODES.completed;
}
async function executeCaseShow({
	commandLine,
}: CommandInvocation): Promise<number> {
	await runCaseShow(
		{ caseId: commandLine.argument, json: commandLine.json },
		processOutput,
	);

	return EXIT_CODES.completed;
}
async function executeCaseCapture({
	commandLine,
	runsDirectory,
}: CommandInvocation): Promise<number> {
	await runCaseCapture(
		{
			caseId: commandLine.argument,
			cut: flagValue(commandLine.flags, "--cut"),
			json: commandLine.json,
			session: flagValue(commandLine.flags, "--session"),
		},
		{
			output: processOutput,
			projectsDirectory: claudeProjectsDirectory(),
			runsDirectory,
		},
	);

	return EXIT_CODES.completed;
}
const casesCommands: readonly CommandEntry[] = [
	{
		definition: {
			confinement: "never",
			flags: [
				{
					help: "Include archived cases",
					kind: "switch",
					name: "--all",
				},
				jsonFlag,
			],
			name: "case list",
			summary: "List active benchmark cases under cases/",
		},
		execute: executeCaseList,
	},
	{
		definition: {
			argument: "case-id",
			confinement: "never",
			flags: [jsonFlag],
			name: "case show",
			summary: "Print one declared benchmark case's declaration",
		},
		execute: executeCaseShow,
	},
	{
		definition: {
			argument: "case-id",
			confinement: "never",
			flags: [
				{
					help: "Session id, or a prefix of one, naming a session this machine recorded: one of the provider's own or one a saved harness attempt holds",
					kind: "value",
					name: "--session",
				},
				{
					help: "0-based index of the first record to drop; the prefix keeps lines [0, cut)",
					kind: "value",
					name: "--cut",
				},
				jsonFlag,
			],
			name: "case capture",
			summary:
				"Capture a session file truncated at a cut as a case's transcript prefix",
		},
		execute: executeCaseCapture,
	},
];
export { casesCommands as default };
