import { parseStaleArgs } from "#benchmark/config";
import { EXIT_CODES } from "#benchmark/exit-codes";
import type { CommandEntry, CommandInvocation } from "#cli/command-contract";
import { corpusFlag, flagValue, jsonFlag } from "#cli/command-flags";
import { asUsageError } from "#cli/command-usage";
import { runList } from "#cli/list-command";
import { processOutput } from "#cli/output";
import { runShow } from "#cli/show-command";
import runStale from "#cli/stale-command";

async function executeList({
	commandLine,
	runsDirectory,
}: CommandInvocation): Promise<number> {
	await runList(
		{
			kind: commandLine.argument,
			runsDirectory,
		},
		processOutput,
	);

	return EXIT_CODES.completed;
}
async function executeShow({
	commandLine,
	runsDirectory,
}: CommandInvocation): Promise<number> {
	await runShow(
		{
			checkout: flagValue(commandLine.flags, "--checkout"),
			id: commandLine.argument,
			json: commandLine.json,
			runsDirectory,
		},
		processOutput,
	);

	return EXIT_CODES.completed;
}
async function executeStale({
	commandLine,
	runsDirectory,
}: CommandInvocation): Promise<number> {
	await runStale(
		{
			...asUsageError(() => parseStaleArgs(commandLine.flags)),
			runsDirectory,
		},
		{ output: processOutput },
	);

	return EXIT_CODES.completed;
}
const recordsCommands: readonly CommandEntry[] = [
	{
		definition: {
			argument:
				"cases|runs|checkpoints|attempts|groups|archived-groups|comparisons",
			confinement: "never",
			flags: [],
			name: "list",
			summary:
				"List recorded cases, runs, checkpoints, attempts, groups, archived groups, or comparisons",
		},
		execute: executeList,
	},
	{
		definition: {
			argument: "record-id",
			confinement: "never",
			flags: [
				{
					help: "Materialize a run's retained candidate as a detached worktree in the new directory named, and print its path",
					kind: "value",
					name: "--checkout",
				},
				jsonFlag,
			],
			name: "show",
			summary: "Print one record by its id, as its bytes or as a card summary",
		},
		execute: executeShow,
	},
	{
		definition: {
			confinement: "never",
			flags: [
				corpusFlag,
				{
					defaultValue: "the model each run recorded, asserting nothing",
					envVar: "BENCHMARK_MODEL",
					help: "Model a replay would use, compared against every recorded checkpoint, stopped stage, replay and group",
					kind: "value",
					name: "--model",
				},
				{
					defaultValue: "the effort each run recorded, asserting nothing",
					envVar: "BENCHMARK_EFFORT",
					help: "Reasoning effort a replay would use: low, medium, high, xhigh, or max",
					kind: "value",
					name: "--effort",
				},
			],
			name: "stale",
			summary:
				"List the checkpoints, stopped stages, session attempts, stage replays and confirmation groups an edit invalidated",
		},
		execute: executeStale,
	},
];
export { recordsCommands as default };
