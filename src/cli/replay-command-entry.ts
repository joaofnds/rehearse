import { EXIT_CODES } from "#benchmark/exit-codes";
import { defaultAssertModelAvailable } from "#benchmark/model-preflight";
import { requireSpendCeiling } from "#benchmark/settings";
import type { CommandEntry, CommandInvocation } from "#cli/command-contract";
import {
	confirmationFlags,
	corpusFlag,
	jsonFlag,
	sessionFlags,
} from "#cli/command-flags";
import { processOutput } from "#cli/output";
import {
	executeReplay,
	resolveRunDirectory,
	runReplayCommand,
} from "#cli/replay-command";

async function dispatchReplay({
	commandLine,
}: CommandInvocation): Promise<number> {
	await runReplayCommand(
		{
			args: commandLine.flags,
			json: commandLine.json,
			stdinIsTerminal: process.stdin.isTTY,
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
const replayCommandEntry: CommandEntry = {
	definition: {
		confinement: "always",
		flags: [
			{
				help: "Name of the recorded run to replay from",
				kind: "value",
				name: "--run",
			},
			{
				help: "Stage to replay from that run's checkpoint",
				kind: "value",
				name: "--stage",
			},
			...sessionFlags,
			corpusFlag,
			...confirmationFlags,
			{
				help: "Replay the stage on a corpus without its own skill, as a comparison's baseline arm; only with --confirm",
				kind: "switch",
				name: "--without-stage-skill",
			},
			jsonFlag,
		],
		name: "replay",
		summary: "Replay one stage of a recorded run against the current corpus",
	},
	execute: dispatchReplay,
};
export { replayCommandEntry as default };
