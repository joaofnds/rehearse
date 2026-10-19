import casesCommands from "#cli/cases-commands";
import type { CommandEntry, CommandInvocation } from "#cli/command-contract";
import comparisonsCommands from "#cli/comparisons-commands";
import corpusCommands from "#cli/corpus-commands";
import diagnosisCommands from "#cli/diagnosis-commands";
import recordsCommands from "#cli/records-commands";
import replayCommandEntry from "#cli/replay-command-entry";
import reviewsCommands from "#cli/reviews-commands";
import runCommandEntry from "#cli/run-command-entry";
import settingsCommands from "#cli/settings-commands";

const entries: readonly CommandEntry[] = [
	runCommandEntry,
	replayCommandEntry,
	...reviewsCommands,
	...diagnosisCommands,
	...comparisonsCommands,
	...recordsCommands,
	...corpusCommands,
	...settingsCommands,
	...casesCommands,
];
// Preserve the public help order independently of dispatch grouping.
const order = [
	"run",
	"replay",
	"review",
	"diagnose",
	"calibrate",
	"compare",
	"compare attempts",
	"compare extend",
	"list",
	"show",
	"regrade",
	"stale",
	"corpus versions",
	"corpus invalidation",
	"corpus show",
	"settings",
	"case list",
	"case show",
	"case capture",
];
const COMMANDS = order.map((name) => {
	const entry = entries.find((candidate) => candidate.definition.name === name);
	if (entry === undefined) {
		throw new Error(`Missing command ${name}`);
	}

	return entry.definition;
});
async function dispatch(
	name: string,
	invocation: CommandInvocation,
): Promise<number> {
	const entry = entries.find((candidate) => candidate.definition.name === name);
	if (entry === undefined) {
		throw new Error(`Command ${name} is declared but not wired up`);
	}

	return await entry.execute(invocation);
}
export { COMMANDS, dispatch };
