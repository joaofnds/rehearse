import { describe, expect, it } from "bun:test";

import type { CommandDefinition } from "#cli/commands";
import {
	COMMANDS,
	UsageError,
	asUsageError,
	commandHelp,
	findCommand,
	parseCommandLine,
} from "#cli/commands";

const FIRST_COMMAND_DEFINITION_INDEX = 0;

const exampleCommand: CommandDefinition = {
	confinement: "never",
	flags: [
		{
			defaultValue: "sonnet",
			envVar: "BENCHMARK_MODEL",
			help: "Model every workflow session uses",
			kind: "value",
			name: "--model",
		},
		{
			help: "Approve the projected cost without a prompt",
			kind: "switch",
			name: "--yes",
		},
	],
	name: "example",
	summary: "Demonstrate the flag table",
};

function matchesAOneWordCommandAndLeavesTheRest(): void {
	expect(findCommand(["run", "--json"])).toEqual({
		args: ["--json"],
		command: COMMANDS[FIRST_COMMAND_DEFINITION_INDEX] ?? exampleCommand,
	});
}

function prefersTheTwoWordNameOverAOneWord(): void {
	const found = findCommand(["case", "show", "audit-log"]);

	expect(found.command.name).toBe("case show");
	expect(found.args).toEqual(["audit-log"]);
}

function namesTheUnknownCommandItRefuses(): void {
	expect(() => findCommand(["bogus"])).toThrow("Unknown command bogus");
}

function namesBothTokensWhenTheSubVerbIsUnknown(): void {
	expect(() => findCommand(["case", "bogus"])).toThrow(
		"Unknown command case bogus",
	);
}

function namesTheUnknownFlagItRefuses(): void {
	expect(() => parseCommandLine(exampleCommand, ["--bogus"])).toThrow(
		"Unknown flag --bogus for rehearse example",
	);
}

function refusesADeclaredFlagStandingWhereAValueBelongs(): void {
	expect(() => parseCommandLine(exampleCommand, ["--model", "--yes"])).toThrow(
		"Flag --model needs a value for rehearse example",
	);
}

function refusesATokenThatIsNotAFlag(): void {
	expect(() => parseCommandLine(exampleCommand, ["oops"])).toThrow(
		"Unexpected argument oops for rehearse example",
	);
}

function refusesAShortFlagAsAUsageErrorRather(): void {
	const compare = COMMANDS.find((command) => command.name === "compare");

	expect(() => parseCommandLine(compare ?? exampleCommand, ["-h"])).toThrow(
		"Unknown flag -h for rehearse compare",
	);
}

function refusesASecondPositionalArgument(): void {
	const compare = COMMANDS.find((command) => command.name === "compare");

	expect(() =>
		parseCommandLine(compare ?? exampleCommand, ["one.json", "two.json"]),
	).toThrow("Unexpected argument two.json for rehearse compare");
}

function reportsTheHelpRequestTheArgumentAndTheRemaining(): void {
	const compare = COMMANDS.find((command) => command.name === "compare");

	expect(
		parseCommandLine(compare ?? exampleCommand, ["manifest.json", "--json"]),
	).toEqual({
		argument: "manifest.json",
		flags: [],
		helpRequested: false,
		json: true,
	});
}

function reportsAHelpRequestBeforeAnyOtherFlagIs(): void {
	expect(parseCommandLine(exampleCommand, ["--help", "--bogus"])).toEqual({
		argument: undefined,
		flags: ["--help", "--bogus"],
		helpRequested: true,
		json: false,
	});
}

function passesDeclaredFlagsThroughInOrderForTheConfiguration(): void {
	expect(
		parseCommandLine(exampleCommand, ["--model", "opus", "--yes"]),
	).toEqual({
		argument: undefined,
		flags: ["--model", "opus", "--yes"],
		helpRequested: false,
		json: false,
	});
}

function reRaisesAConfigurationRejectionAsAUsageError(): void {
	expect(() =>
		asUsageError(() => {
			throw new Error("Provide --target or BENCHMARK_TARGET_DIR");
		}),
	).toThrow(new UsageError("Provide --target or BENCHMARK_TARGET_DIR"));
}

function returnsTheParsedConfigurationWhenParsingSucceeds(): void {
	expect(asUsageError(() => "parsed")).toBe("parsed");
}

function declaresCorpusOnceAsOneSharedDefinition(): void {
	const lowerBoundForDeclarationsCount = 1;
	const expectedSize = 1;

	const declarations = COMMANDS.flatMap((command) =>
		command.flags.filter((flag) => flag.name === "--corpus"),
	);

	expect(declarations.length).toBeGreaterThan(lowerBoundForDeclarationsCount);
	expect(new Set(declarations).size).toBe(expectedSize);
}

function confinesTheCommandsWhoseSessionsRunCommandsAndRun(): void {
	const declared = Object.fromEntries(
		COMMANDS.map((command) => [command.name, command.confinement]),
	);

	expect(declared).toEqual({
		calibrate: "never",
		"case capture": "never",
		"case list": "never",
		"case show": "never",
		compare: "never",
		"compare attempts": "always",
		"compare extend": "always",
		"corpus invalidation": "never",
		"corpus show": "never",
		"corpus versions": "never",
		diagnose: "never",
		list: "never",
		regrade: "never",
		replay: "always",
		review: "never",
		run: "by case",
		settings: "never",
		show: "never",
		stale: "never",
	});
}

describe(findCommand.name, () => {
	it(
		"matches a one-word command and leaves the rest as arguments",
		matchesAOneWordCommandAndLeavesTheRest,
	);
	it(
		"prefers the two-word name over a one-word prefix of it",
		prefersTheTwoWordNameOverAOneWord,
	);
	it("names the unknown command it refuses", namesTheUnknownCommandItRefuses);
	it(
		"names both tokens when the sub-verb is unknown",
		namesBothTokensWhenTheSubVerbIsUnknown,
	);
});

describe(parseCommandLine.name, () => {
	it("names the unknown flag it refuses", namesTheUnknownFlagItRefuses);
	it(
		"refuses a declared flag standing where a value belongs",
		refusesADeclaredFlagStandingWhereAValueBelongs,
	);
	it("refuses a token that is not a flag", refusesATokenThatIsNotAFlag);
	it(
		"refuses a short flag as a usage error rather than a positional argument",
		refusesAShortFlagAsAUsageErrorRather,
	);
	it("refuses a second positional argument", refusesASecondPositionalArgument);
	it(
		"reports the help request, the argument, and the remaining flags",
		reportsTheHelpRequestTheArgumentAndTheRemaining,
	);
	it(
		"reports a help request before any other flag is judged",
		reportsAHelpRequestBeforeAnyOtherFlagIs,
	);
	it(
		"passes declared flags through in order for the configuration parser",
		passesDeclaredFlagsThroughInOrderForTheConfiguration,
	);
});

describe(asUsageError.name, () => {
	it(
		"re-raises a configuration rejection as a usage error",
		reRaisesAConfigurationRejectionAsAUsageError,
	);
	it(
		"returns the parsed configuration when parsing succeeds",
		returnsTheParsedConfigurationWhenParsingSucceeds,
	);
});

describe("the corpus source flag", () => {
	it.each(["run", "replay"])(
		"%s lists --corpus with its source syntax",
		(name) => {
			const command = COMMANDS.find((declared) => declared.name === name);
			const help = commandHelp(command ?? exampleCommand);

			expect(help).toContain("--corpus");
			expect(help).toContain("directory in corpus layout");
		},
	);
	it(
		"declares --corpus once, as one shared definition",
		declaresCorpusOnceAsOneSharedDefinition,
	);
});

describe("the confinement each command declares", () => {
	it(
		"confines the commands whose sessions run commands, and run by its case",
		confinesTheCommandsWhoseSessionsRunCommandsAndRun,
	);
});
