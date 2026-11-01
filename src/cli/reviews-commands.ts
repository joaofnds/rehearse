import { EXIT_CODES } from "#benchmark/exit-codes";
import calibrateCommandEntry from "#cli/calibrate-command-entry";
import { requireCase } from "#cli/case-command";
import type { CommandEntry, CommandInvocation } from "#cli/command-contract";
import { flagValue, jsonFlag, repeatedFlagValues } from "#cli/command-flags";
import { processOutput } from "#cli/output";
import runRegrade from "#cli/regrade-command";
import runReview from "#cli/review-command";

async function executeReview({
	commandLine,
	runsDirectory,
}: CommandInvocation): Promise<number> {
	await runReview(
		{
			file: flagValue(commandLine.flags, "--file"),
			findings: repeatedFlagValues(commandLine.flags, "--finding"),
			id: commandLine.argument,
			json: commandLine.json,
			runsDirectory,
			summary: flagValue(commandLine.flags, "--summary"),
			verdict: flagValue(commandLine.flags, "--verdict"),
		},
		processOutput,
	);

	return EXIT_CODES.completed;
}
async function executeRegrade({
	commandLine,
	runsDirectory,
}: CommandInvocation): Promise<number> {
	await runRegrade(
		{
			id: commandLine.argument,
			json: commandLine.json,
			model:
				flagValue(commandLine.flags, "--model") ?? Bun.env["BENCHMARK_MODEL"],
			runsDirectory,
			stdinIsTerminal: process.stdin.isTTY,
		},
		{
			now: () => new Date().toISOString(),
			output: processOutput,
			requireCase,
		},
	);

	return EXIT_CODES.completed;
}

const reviewsCommands: readonly CommandEntry[] = [
	{
		definition: {
			argument: "run|session-record-id",
			confinement: "never",
			flags: [
				{
					help: "Path to a review JSON file, instead of describing one with the flags below",
					kind: "value",
					name: "--file",
				},
				{
					help: "ACCEPT or REJECT for a pipeline; PASS or FAIL for a session",
					kind: "value",
					name: "--verdict",
				},
				{
					help: "One-line summary of the review",
					kind: "value",
					name: "--summary",
				},
				{
					help: "One finding as a JSON object; repeat the flag for each finding, in order",
					kind: "value",
					name: "--finding",
				},
				{
					...jsonFlag,
					help: "Print the pipeline review record or session review context as JSON",
				},
			],
			name: "review",
			summary:
				"Record a pipeline review, or read/record a saved session human review",
		},
		execute: executeReview,
	},
	{
		definition: {
			argument: "record-id",
			confinement: "never",
			flags: [
				{
					envVar: "BENCHMARK_MODEL",
					help: "Judge model override; authorizes a paid regrade outside a terminal",
					kind: "value",
					name: "--model",
				},
				jsonFlag,
			],
			name: "regrade",
			summary:
				"Re-evaluate saved evidence against current checks and rubric; may start a sealed Judge",
		},
		execute: executeRegrade,
	},
	calibrateCommandEntry,
];
export { reviewsCommands as default };
