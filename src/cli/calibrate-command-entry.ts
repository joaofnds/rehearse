import { EXIT_CODES } from "#benchmark/exit-codes";
import { defaultAssertModelAvailable } from "#benchmark/model-preflight";
import { requireSpendCeiling } from "#benchmark/settings";
import { runCalibrate } from "#cli/calibrate-command";
import judgesFor from "#cli/calibration-judges";
import type { CommandEntry, CommandInvocation } from "#cli/command-contract";
import { jsonFlag } from "#cli/command-flags";
import { processOutput } from "#cli/output";

async function executeCalibrate({
	commandLine,
	runsDirectory,
}: CommandInvocation): Promise<number> {
	await runCalibrate(
		{
			confirmRejudge: commandLine.flags.includes("--confirm-rejudge"),
			id: commandLine.argument,
			json: commandLine.json,
			runsDirectory,
		},
		{
			buildJudges: judgesFor,
			output: processOutput,
			probeModel: defaultAssertModelAvailable,
			requireSpendCeiling,
		},
	);

	return EXIT_CODES.completed;
}
const calibrateCommandEntry: CommandEntry = {
	definition: {
		argument: "run",
		confinement: "never",
		flags: [
			{
				help: "Record a revised Judge result; required when the rejudge changed a grade",
				kind: "switch",
				name: "--confirm-rejudge",
			},
			jsonFlag,
		],
		name: "calibrate",
		summary:
			"Rejudge a run's frozen evidence with the current rubrics and record the result",
	},
	execute: executeCalibrate,
};
export { calibrateCommandEntry as default };
