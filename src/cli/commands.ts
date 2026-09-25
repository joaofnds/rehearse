import { DEFAULT_CASE_ID } from "#benchmark/config";
import type { CommandFailure } from "#benchmark/exit-codes";
import { EXIT_CODES } from "#benchmark/exit-codes";

export interface FlagDefinition {
	readonly name: string;
	readonly kind: "value" | "switch";
	readonly envVar?: string | undefined;
	readonly defaultValue?: string | undefined;
	readonly help: string;
}

export interface CommandDefinition {
	readonly name: string;
	readonly summary: string;
	readonly argument?: string | undefined;
	readonly flags: readonly FlagDefinition[];
}

function flagLine(flag: FlagDefinition): string {
	const qualifiers = [
		flag.defaultValue === undefined
			? undefined
			: `default ${flag.defaultValue}`,
		flag.envVar === undefined ? undefined : `env ${flag.envVar}`,
	].filter((qualifier) => qualifier !== undefined);
	const suffix = qualifiers.length === 0 ? "" : ` (${qualifiers.join(", ")})`;

	return `  ${flag.name}${flag.kind === "value" ? " <value>" : ""}: ${flag.help}${suffix}`;
}

export function commandHelp(command: CommandDefinition): string {
	const usage = [
		"rehearse",
		command.name,
		command.argument === undefined ? undefined : `<${command.argument}>`,
		command.flags.length === 0 ? undefined : "[flags]",
	]
		.filter((part) => part !== undefined)
		.join(" ");

	const flags =
		command.flags.length === 0
			? []
			: ["", "Flags:", ...command.flags.map((flag) => flagLine(flag))];

	return [`Usage: ${usage}`, "", command.summary, ...flags, ""].join("\n");
}

const sessionFlags: readonly FlagDefinition[] = [
	{
		name: "--model",
		kind: "value",
		envVar: "BENCHMARK_MODEL",
		help: "Model every workflow session and the Product Owner use",
	},
	{
		name: "--effort",
		kind: "value",
		envVar: "BENCHMARK_EFFORT",
		help: "Reasoning effort for the workflow: low, medium, high, xhigh, or max",
	},
	{
		name: "--judge-model",
		kind: "value",
		envVar: "BENCHMARK_JUDGE_MODEL",
		defaultValue: "opus, or sonnet when the workflow model is opus",
		help: "Model the stage and final Judges use",
	},
	{
		name: "--judge-effort",
		kind: "value",
		envVar: "BENCHMARK_JUDGE_EFFORT",
		defaultValue: "the workflow effort",
		help: "Reasoning effort for the Judges",
	},
	{
		name: "--session-budget-usd",
		kind: "value",
		envVar: "BENCHMARK_SESSION_BUDGET_USD",
		help: "Spend limit enforced for each session",
	},
	{
		name: "--minimum-grade",
		kind: "value",
		envVar: "BENCHMARK_MINIMUM_GRADE",
		defaultValue: "B",
		help: "Lowest stage grade a run continues past; the Judge still grades and records as it does now",
	},
];

const corpusFlag: FlagDefinition = {
	name: "--corpus",
	kind: "value",
	defaultValue: "the live install",
	help: "Corpus under test: a directory in corpus layout",
};

const confirmationFlags: readonly FlagDefinition[] = [
	{
		name: "--confirm",
		kind: "switch",
		help: "Run a confirmation group instead of one debug rep",
	},
	{
		name: "--reps",
		kind: "value",
		defaultValue: "5",
		help: "Reps in the confirmation group; at least 2, only with --confirm",
	},
	{
		name: "--yes",
		kind: "switch",
		help: "Approve the projected cost without a prompt, only with --confirm",
	},
];

const jsonFlag: FlagDefinition = {
	name: "--json",
	kind: "switch",
	help: "Print the record's own bytes on stdout instead of its path",
};

export const COMMANDS: readonly CommandDefinition[] = [
	{
		name: "run",
		summary: "Run the pipeline against the target repository and grade it",
		flags: [
			{
				name: "--case",
				kind: "value",
				envVar: "BENCHMARK_CASE",
				defaultValue: DEFAULT_CASE_ID,
				help: "Declared benchmark case under cases/ the run executes",
			},
			{
				name: "--target",
				kind: "value",
				envVar: "BENCHMARK_TARGET_DIR",
				help: "Target repository the pipeline runs in; defaults to the case's declared target",
			},
			...sessionFlags,
			corpusFlag,
			{
				name: "--pipeline",
				kind: "value",
				envVar: "BENCHMARK_PIPELINE",
				defaultValue: "the case's declared pipeline",
				help: "Pipeline definition the run executes, overriding the case's",
			},
			{
				name: "--pause",
				kind: "switch",
				help: "Stop with the candidate in the target for an interactive review; needs a terminal",
			},
			...confirmationFlags,
			jsonFlag,
		],
	},
	{
		name: "replay",
		summary: "Replay one stage of a recorded run against the current corpus",
		flags: [
			{
				name: "--run",
				kind: "value",
				help: "Name of the recorded run to replay from",
			},
			{
				name: "--stage",
				kind: "value",
				help: "Stage to replay from that run's checkpoint",
			},
			...sessionFlags,
			corpusFlag,
			...confirmationFlags,
			jsonFlag,
		],
	},
	{
		name: "review",
		summary: "Record the human or agent review of a run's Judge result",
		argument: "run",
		flags: [
			{
				name: "--file",
				kind: "value",
				help: "Path to a review JSON file, instead of describing one with the flags below",
			},
			{
				name: "--verdict",
				kind: "value",
				help: "ACCEPT or REJECT",
			},
			{
				name: "--summary",
				kind: "value",
				help: "One-line summary of the review",
			},
			{
				name: "--finding",
				kind: "value",
				help: "One finding as a JSON object; repeat the flag for each finding, in order",
			},
			jsonFlag,
		],
	},
	{
		name: "calibrate",
		summary:
			"Rejudge a run's frozen evidence with the current rubrics and record the result",
		argument: "run",
		flags: [
			{
				name: "--confirm-rejudge",
				kind: "switch",
				help: "Record a revised Judge result; required when the rejudge changed a grade",
			},
			jsonFlag,
		],
	},
	{
		name: "compare",
		summary: "Report over completed confirmation evidence; runs no session",
		argument: "comparison-manifest.json",
		flags: [jsonFlag],
	},
	{
		name: "list",
		summary:
			"List recorded cases, runs, checkpoints, attempts, groups, or comparisons",
		argument: "cases|runs|checkpoints|attempts|groups|comparisons",
		flags: [],
	},
	{
		name: "show",
		summary: "Print one record by its id, as its bytes or as a card summary",
		argument: "record-id",
		flags: [
			{
				name: "--checkout",
				kind: "value",
				help: "Materialize a run's retained candidate as a detached worktree in the new directory named, and print its path",
			},
			jsonFlag,
		],
	},
	{
		name: "regrade",
		summary:
			"Re-evaluate a saved attempt's evidence against its case as it stands now; runs no session",
		argument: "record-id",
		flags: [jsonFlag],
	},
	{
		name: "stale",
		summary:
			"List the checkpoints, stopped stages, session attempts, stage replays and confirmation groups an edit invalidated",
		flags: [
			corpusFlag,
			{
				name: "--model",
				kind: "value",
				envVar: "BENCHMARK_MODEL",
				defaultValue: "the model each run recorded, asserting nothing",
				help: "Model a replay would use, compared against every recorded checkpoint, stopped stage, replay and group",
			},
			{
				name: "--effort",
				kind: "value",
				envVar: "BENCHMARK_EFFORT",
				defaultValue: "the effort each run recorded, asserting nothing",
				help: "Reasoning effort a replay would use: low, medium, high, xhigh, or max",
			},
		],
	},
	{
		name: "corpus versions",
		summary: "List the versions a corpus source was measured at, oldest first",
		flags: [corpusFlag],
	},
	{
		name: "corpus invalidation",
		summary:
			"Count the run-history rows that read each corpus file, and list the rows the last edit invalidated",
		flags: [corpusFlag],
	},
	{
		name: "corpus show",
		summary:
			"Print a recorded corpus version's files, or one file as that version held it",
		argument: "corpus-version",
		flags: [
			{
				name: "--file",
				kind: "value",
				help: "Corpus layout path to print, such as output-styles/brief.md",
			},
		],
	},
	{
		name: "case list",
		summary: "List every declared benchmark case under cases/",
		flags: [jsonFlag],
	},
	{
		name: "case show",
		summary: "Print one declared benchmark case's declaration",
		argument: "case-id",
		flags: [jsonFlag],
	},
	{
		name: "case capture",
		summary:
			"Capture a session file truncated at a cut as a case's transcript prefix",
		argument: "case-id",
		flags: [
			{
				name: "--session",
				kind: "value",
				help: "Session id, or a prefix of one, naming a session this machine recorded: one of the provider's own or one a saved harness attempt holds",
			},
			{
				name: "--cut",
				kind: "value",
				help: "0-based index of the first record to drop; the prefix keeps lines [0, cut)",
			},
			jsonFlag,
		],
	},
];

const COMMAND_NAME_COLUMN =
	Math.max(...COMMANDS.map((command) => command.name.length)) + 2;

export function topLevelHelp(): string {
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

export interface CommandLine {
	readonly helpRequested: boolean;
	readonly argument: string | undefined;
	readonly json: boolean;
	readonly flags: readonly string[];
}

export class UsageError extends Error implements CommandFailure {
	public readonly exitCode = EXIT_CODES.usageError;

	public constructor(message: string) {
		super(message);
		this.name = "UsageError";
	}
}

export interface FoundCommand {
	readonly command: CommandDefinition;
	readonly args: readonly string[];
}

/**
 * A command name is one or two tokens, and `case` is both a prefix of
 * `case list` and not a command itself, so the longer declared name is tried
 * first.
 */
export function findCommand(argv: readonly string[]): FoundCommand {
	const candidates = COMMANDS.toSorted(
		(left, right) => right.name.length - left.name.length,
	);
	for (const command of candidates) {
		const tokens = command.name.split(" ");
		if (tokens.every((token, index) => argv[index] === token)) {
			return { command, args: argv.slice(tokens.length) };
		}
	}

	const longestName = Math.max(
		...COMMANDS.map((command) => command.name.split(" ").length),
	);

	throw new UsageError(
		`Unknown command ${argv.slice(0, longestName).join(" ")}`,
	);
}

const HELP_FLAG = "--help";
const JSON_FLAG = "--json";

function takesValue(command: CommandDefinition, name: string): boolean {
	return command.flags.some(
		(flag) => flag.name === name && flag.kind === "value",
	);
}

function declares(command: CommandDefinition, name: string): boolean {
	return command.flags.some((flag) => flag.name === name);
}

export function parseCommandLine(
	command: CommandDefinition,
	args: readonly string[],
): CommandLine {
	if (args.includes(HELP_FLAG)) {
		return {
			helpRequested: true,
			argument: undefined,
			json: false,
			flags: [...args],
		};
	}

	let argument: string | undefined;
	let json = false;
	const flags: string[] = [];

	for (let index = 0; index < args.length;) {
		const token = args[index];
		if (token === undefined) {
			break;
		}
		if (!token.startsWith("-")) {
			if (command.argument === undefined || argument !== undefined) {
				throw new UsageError(
					`Unexpected argument ${token} for rehearse ${command.name}`,
				);
			}
			argument = token;
			index += 1;
			continue;
		}
		if (!declares(command, token)) {
			throw new UsageError(
				`Unknown flag ${token} for rehearse ${command.name}`,
			);
		}
		if (token === JSON_FLAG) {
			json = true;
			index += 1;
			continue;
		}

		flags.push(token);
		if (takesValue(command, token)) {
			const value = args[index + 1];
			if (value === undefined || declares(command, value)) {
				throw new UsageError(
					`Flag ${token} needs a value for rehearse ${command.name}`,
				);
			}
			flags.push(value);
			index += 2;
			continue;
		}

		index += 1;
	}

	return { helpRequested: false, argument, json, flags };
}

/**
 * Configuration parsing rejects a missing or unparseable flag value with a
 * plain error; at this boundary that is a usage error, and the exit code has
 * to say so.
 */
export function asUsageError<Parsed>(parse: () => Parsed): Parsed {
	try {
		return parse();
	} catch (error) {
		throw new UsageError(
			error instanceof Error ? error.message : String(error),
		);
	}
}

/**
 * Parsing a corpus source reads the filesystem to tell whether the directory
 * holds a corpus, so its rejection arrives as a rejected promise rather than a
 * throw; at this boundary it is the same usage error.
 */
export async function asUsageErrorAsync<Parsed>(
	parse: () => Promise<Parsed>,
): Promise<Parsed> {
	try {
		return await parse();
	} catch (error) {
		throw new UsageError(
			error instanceof Error ? error.message : String(error),
		);
	}
}
