import { COMMANDS } from "#cli/command-catalog";
import type { CommandDefinition, FlagDefinition } from "#cli/command-contract";
import { UsageError } from "#cli/command-usage";

const EMPTY_COLLECTION_LENGTH = 0;
const HELP_NAME_COLUMN_PADDING = 2;
const PREFIX_START_INDEX = 0;

function flagLine(flag: FlagDefinition): string {
	const qualifiers = [
		flag.defaultValue === undefined
			? undefined
			: `default ${flag.defaultValue}`,
		flag.envVar === undefined ? undefined : `env ${flag.envVar}`,
	].filter((qualifier) => qualifier !== undefined);
	const suffix =
		qualifiers.length === EMPTY_COLLECTION_LENGTH
			? ""
			: ` (${qualifiers.join(", ")})`;

	return `  ${flag.name}${flag.kind === "value" ? " <value>" : ""}: ${flag.help}${suffix}`;
}

function commandHelp(command: CommandDefinition): string {
	const usage = [
		"rehearse",
		command.name,
		command.argument === undefined ? undefined : `<${command.argument}>`,
		command.flags.length === EMPTY_COLLECTION_LENGTH ? undefined : "[flags]",
	]
		.filter((part) => part !== undefined)
		.join(" ");

	const flags =
		command.flags.length === EMPTY_COLLECTION_LENGTH
			? []
			: ["", "Flags:", ...command.flags.map((flag) => flagLine(flag))];

	return [`Usage: ${usage}`, "", command.summary, ...flags, ""].join("\n");
}

const COMMAND_NAME_COLUMN =
	Math.max(...COMMANDS.map((command) => command.name.length)) +
	HELP_NAME_COLUMN_PADDING;

function topLevelHelp(): string {
	return [
		"Usage: rehearse <command> [flags]",
		"",
		"Commands:",
		...COMMANDS.map(
			(command) =>
				`  ${command.name.padEnd(COMMAND_NAME_COLUMN)}${command.summary}`,
		),
		"",
		"Exit codes:",
		"  0  the command completed and wrote its record, whatever the grade",
		"  1  execution failure",
		"  2  usage error",
		"  3  refused precondition",
		"",
		"Run `rehearse <command> --help` for a command's flags.",
		"",
	].join("\n");
}

interface FoundCommand {
	readonly command: CommandDefinition;
	readonly args: readonly string[];
}

/**
 * A command name is one or two tokens, and `case` is both a prefix of
 * `case list` and not a command itself, so the longer declared name is tried
 * first.
 */
function findCommand(argv: readonly string[]): FoundCommand {
	const candidates = COMMANDS.toSorted(
		(left, right) => right.name.length - left.name.length,
	);
	for (const command of candidates) {
		const tokens = command.name.split(" ");
		if (tokens.every((token, index) => argv[index] === token)) {
			return { args: argv.slice(tokens.length), command };
		}
	}

	const longestName = Math.max(
		...COMMANDS.map((command) => command.name.split(" ").length),
	);

	throw new UsageError(
		`Unknown command ${argv.slice(PREFIX_START_INDEX, longestName).join(" ")}`,
	);
}

export { commandHelp, findCommand, topLevelHelp };

export type {
	CommandDefinition,
	CommandLine,
	Confinement,
	FlagDefinition,
} from "#cli/command-contract";
export type { FoundCommand };

export { COMMANDS } from "#cli/command-catalog";
export {
	asUsageError,
	asUsageErrorAsync,
	UsageError,
} from "#cli/command-usage";

export { default as parseCommandLine } from "#cli/command-arguments";
