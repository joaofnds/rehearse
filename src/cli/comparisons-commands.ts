import { EXIT_CODES } from "#benchmark/exit-codes";
import { defaultAssertModelAvailable } from "#benchmark/model-preflight";
import { requireSpendCeiling } from "#benchmark/settings";
import type { CommandEntry, CommandInvocation } from "#cli/command-contract";
import { flagValue, jsonFlag } from "#cli/command-flags";
import {
	runCompareAttemptsCommand,
	runCompareExtendCommand,
} from "#cli/compare-attempts-command";
import runCompare from "#cli/compare-command";
import { processOutput } from "#cli/output";
import terminalQuestioner from "#cli/questioner";
import { executeReplay, resolveRunDirectory } from "#cli/replay-command";

async function executeCompare({
	commandLine,
	runsDirectory,
}: CommandInvocation): Promise<number> {
	await runCompare(
		{
			json: commandLine.json,
			manifestPath: commandLine.argument,
			runsDirectory,
		},
		processOutput,
	);

	return EXIT_CODES.completed;
}
async function executeCompareAttempts({
	commandLine,
	runsDirectory,
}: CommandInvocation): Promise<number> {
	await runCompareAttemptsCommand(
		{
			approvedInBrowser: commandLine.flags.includes("--approved-in-browser"),
			armA: flagValue(commandLine.flags, "--arm-a"),
			armB: flagValue(commandLine.flags, "--arm-b"),
			json: commandLine.json,
			runsDirectory,
			stdinIsTerminal: process.stdin.isTTY,
			yes: commandLine.flags.includes("--yes"),
		},
		{
			execute: executeReplay,
			output: processOutput,
			probeModel: defaultAssertModelAvailable,
			requireSpendCeiling,
			resolveRunDirectory,
		},
	);

	return EXIT_CODES.completed;
}
async function executeCompareExtend({
	commandLine,
	runsDirectory,
}: CommandInvocation): Promise<number> {
	await runCompareExtendCommand(
		{
			approvedInBrowser: commandLine.flags.includes("--approved-in-browser"),
			attempts: flagValue(commandLine.flags, "--attempts"),
			comparison: flagValue(commandLine.flags, "--comparison"),
			json: commandLine.json,
			runsDirectory,
			stdinIsTerminal: process.stdin.isTTY,
			yes: commandLine.flags.includes("--yes"),
		},
		{
			execute: executeReplay,
			output: processOutput,
			probeModel: defaultAssertModelAvailable,
			prompt: async (message) => {
				const questioner = terminalQuestioner();
				try {
					return await questioner.question(message);
				} finally {
					questioner.close();
				}
			},
			requireSpendCeiling,
			resolveRunDirectory,
		},
	);

	return EXIT_CODES.completed;
}
const comparisonsCommands: readonly CommandEntry[] = [
	{
		definition: {
			argument: "comparison-manifest.json",
			confinement: "never",
			flags: [jsonFlag],
			name: "compare",
			summary: "Report over completed confirmation evidence; runs no session",
		},
		execute: executeCompare,
	},
	{
		definition: {
			confinement: "always",
			flags: [
				{
					help: "Group id of the attempt that stands as arm A, the baseline role",
					kind: "value",
					name: "--arm-a",
				},
				{
					help: "Group id of the attempt that stands as arm B, the candidate role",
					kind: "value",
					name: "--arm-b",
				},
				{
					help: "Approve the baseline group's projected cost without a prompt",
					kind: "switch",
					name: "--yes",
				},
				{
					help: "Record the --yes approval as given in the browser's launch dialog",
					kind: "switch",
					name: "--approved-in-browser",
				},
				jsonFlag,
			],
			name: "compare attempts",
			summary:
				"Compare two replay confirmation groups at one checkpoint, running only a baseline arm derived from arm A",
		},
		execute: executeCompareAttempts,
	},
	{
		definition: {
			confinement: "always",
			flags: [
				{
					help: "The saved comparison to extend, as `list comparisons` names it or by its manifest digest",
					kind: "value",
					name: "--comparison",
				},
				{
					help: "How many attempts to add to each arm",
					kind: "value",
					name: "--attempts",
				},
				{
					help: "Approve the stated cost without a prompt",
					kind: "switch",
					name: "--yes",
				},
				{
					help: "Record the --yes approval as given in the browser's launch dialog",
					kind: "switch",
					name: "--approved-in-browser",
				},
				jsonFlag,
			],
			name: "compare extend",
			summary:
				"Add attempts to every arm of a comparison compare attempts saved, at a stated cost, as a new comparison",
		},
		execute: executeCompareExtend,
	},
];
export { comparisonsCommands as default };
