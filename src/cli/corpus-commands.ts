import { EXIT_CODES } from "#benchmark/exit-codes";
import type { CommandEntry, CommandInvocation } from "#cli/command-contract";
import { corpusFlag, flagValue } from "#cli/command-flags";
import {
	runCorpusInvalidation,
	runCorpusShow,
	runCorpusVersions,
} from "#cli/corpus-command";
import { processOutput } from "#cli/output";

async function executeCorpusVersions({
	commandLine,
	runsDirectory,
}: CommandInvocation): Promise<number> {
	await runCorpusVersions(
		{
			corpus: flagValue(commandLine.flags, "--corpus"),
			runsDirectory,
		},
		{ output: processOutput },
	);

	return EXIT_CODES.completed;
}
async function executeCorpusInvalidation({
	commandLine,
	runsDirectory,
}: CommandInvocation): Promise<number> {
	await runCorpusInvalidation(
		{
			corpus: flagValue(commandLine.flags, "--corpus"),
			runsDirectory,
		},
		{ output: processOutput },
	);

	return EXIT_CODES.completed;
}
async function executeCorpusShow({
	commandLine,
	runsDirectory,
}: CommandInvocation): Promise<number> {
	await runCorpusShow(
		{
			file: flagValue(commandLine.flags, "--file"),
			runsDirectory,
			version: commandLine.argument,
		},
		processOutput,
	);

	return EXIT_CODES.completed;
}
const corpusCommands: readonly CommandEntry[] = [
	{
		definition: {
			confinement: "never",
			flags: [corpusFlag],
			name: "corpus versions",
			summary:
				"List the versions a corpus source was measured at, oldest first",
		},
		execute: executeCorpusVersions,
	},
	{
		definition: {
			confinement: "never",
			flags: [corpusFlag],
			name: "corpus invalidation",
			summary:
				"Count the run-history rows that read each corpus file, and list the rows the last edit invalidated",
		},
		execute: executeCorpusInvalidation,
	},
	{
		definition: {
			argument: "corpus-version",
			confinement: "never",
			flags: [
				{
					help: "Corpus layout path to print, such as output-styles/brief.md",
					kind: "value",
					name: "--file",
				},
			],
			name: "corpus show",
			summary:
				"Print a recorded corpus version's files, or one file as that version held it",
		},
		execute: executeCorpusShow,
	},
];
export { corpusCommands as default };
