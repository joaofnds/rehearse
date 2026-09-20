import { describe, expect, it } from "bun:test";
import type { CommandDefinition } from "#cli/commands";
import {
	asUsageError,
	COMMANDS,
	commandHelp,
	findCommand,
	parseCommandLine,
	topLevelHelp,
	UsageError,
} from "#cli/commands";

const exampleCommand: CommandDefinition = {
	name: "example",
	summary: "Demonstrate the flag table",
	flags: [
		{
			name: "--model",
			kind: "value",
			envVar: "BENCHMARK_MODEL",
			defaultValue: "sonnet",
			help: "Model every workflow session uses",
		},
		{
			name: "--yes",
			kind: "switch",
			help: "Approve the projected cost without a prompt",
		},
	],
};

describe(commandHelp.name, () => {
	it("names every declared flag with its default and environment variable", () => {
		const help = commandHelp(exampleCommand);

		expect(help).toContain("--model");
		expect(help).toContain("BENCHMARK_MODEL");
		expect(help).toContain("sonnet");
		expect(help).toContain("Model every workflow session uses");
		expect(help).toContain("--yes");
		expect(help).toContain("Approve the projected cost without a prompt");
	});
});

describe(topLevelHelp.name, () => {
	it("lists every command with its summary and the exit-code meanings", () => {
		const help = topLevelHelp();

		for (const command of COMMANDS) {
			expect(help).toContain(command.name);
			expect(help).toContain(command.summary);
		}
		expect(help).toContain("0  the command completed and wrote its record");
		expect(help).toContain("1  execution failure");
		expect(help).toContain("2  usage error");
		expect(help).toContain("3  refused precondition");
	});
});

describe("declared commands", () => {
	it("declares run, replay, compare, the record readers, and the case verbs", () => {
		expect(COMMANDS.map((command) => command.name)).toEqual([
			"run",
			"replay",
			"review",
			"calibrate",
			"compare",
			"list",
			"show",
			"regrade",
			"stale",
			"case list",
			"case show",
			"case capture",
		]);
	});

	it.each(COMMANDS.map((command) => command.name))(
		"names every flag %s declares in its own help",
		(name) => {
			const command = COMMANDS.find((candidate) => candidate.name === name);
			const help = commandHelp(command ?? exampleCommand);

			expect(help).toContain(`rehearse ${name}`);
			for (const flag of command?.flags ?? []) {
				expect(help).toContain(flag.name);
				expect(help).toContain(flag.help);
				if (flag.envVar !== undefined) {
					expect(help).toContain(flag.envVar);
				}
				if (flag.defaultValue !== undefined) {
					expect(help).toContain(flag.defaultValue);
				}
			}
		},
	);

	it("omits the flags heading for a command that declares none", () => {
		const help = commandHelp({
			name: "list",
			summary: "List the records",
			argument: "kind",
			flags: [],
		});

		expect(help).not.toContain("Flags:");
		expect(help).toBe("Usage: rehearse list <kind>\n\nList the records\n");
	});

	it("declares the run flags the card names", () => {
		const run = COMMANDS.find((command) => command.name === "run");

		expect(run?.flags.map((flag) => flag.name)).toEqual([
			"--case",
			"--target",
			"--model",
			"--effort",
			"--judge-model",
			"--judge-effort",
			"--session-budget-usd",
			"--minimum-grade",
			"--corpus",
			"--pipeline",
			"--pause",
			"--confirm",
			"--reps",
			"--yes",
			"--json",
		]);
	});
});

describe(findCommand.name, () => {
	it("matches a one-word command and leaves the rest as arguments", () => {
		expect(findCommand(["run", "--json"])).toEqual({
			command: COMMANDS[0] ?? exampleCommand,
			args: ["--json"],
		});
	});

	it("prefers the two-word name over a one-word prefix of it", () => {
		const found = findCommand(["case", "show", "audit-log"]);

		expect(found.command.name).toBe("case show");
		expect(found.args).toEqual(["audit-log"]);
	});

	it("names the unknown command it refuses", () => {
		expect(() => findCommand(["bogus"])).toThrow("Unknown command bogus");
	});

	it("names both tokens when the sub-verb is unknown", () => {
		expect(() => findCommand(["case", "bogus"])).toThrow(
			"Unknown command case bogus",
		);
	});
});

describe(parseCommandLine.name, () => {
	it("names the unknown flag it refuses", () => {
		expect(() => parseCommandLine(exampleCommand, ["--bogus"])).toThrow(
			"Unknown flag --bogus for rehearse example",
		);
	});

	it("refuses a declared flag standing where a value belongs", () => {
		expect(() =>
			parseCommandLine(exampleCommand, ["--model", "--yes"]),
		).toThrow("Flag --model needs a value for rehearse example");
	});

	it("refuses a token that is not a flag", () => {
		expect(() => parseCommandLine(exampleCommand, ["oops"])).toThrow(
			"Unexpected argument oops for rehearse example",
		);
	});

	it("refuses a short flag as a usage error rather than a positional argument", () => {
		const compare = COMMANDS.find((command) => command.name === "compare");

		expect(() => parseCommandLine(compare ?? exampleCommand, ["-h"])).toThrow(
			"Unknown flag -h for rehearse compare",
		);
	});

	it("refuses a second positional argument", () => {
		const compare = COMMANDS.find((command) => command.name === "compare");

		expect(() =>
			parseCommandLine(compare ?? exampleCommand, ["one.json", "two.json"]),
		).toThrow("Unexpected argument two.json for rehearse compare");
	});

	it("reports the help request, the argument, and the remaining flags", () => {
		const compare = COMMANDS.find((command) => command.name === "compare");

		expect(
			parseCommandLine(compare ?? exampleCommand, ["manifest.json", "--json"]),
		).toEqual({
			helpRequested: false,
			argument: "manifest.json",
			json: true,
			flags: [],
		});
	});

	it("reports a help request before any other flag is judged", () => {
		expect(parseCommandLine(exampleCommand, ["--help", "--bogus"])).toEqual({
			helpRequested: true,
			argument: undefined,
			json: false,
			flags: ["--help", "--bogus"],
		});
	});

	it("passes declared flags through in order for the configuration parser", () => {
		expect(
			parseCommandLine(exampleCommand, ["--model", "opus", "--yes"]),
		).toEqual({
			helpRequested: false,
			argument: undefined,
			json: false,
			flags: ["--model", "opus", "--yes"],
		});
	});
});

describe(asUsageError.name, () => {
	it("re-raises a configuration rejection as a usage error", () => {
		expect(() =>
			asUsageError(() => {
				throw new Error("Provide --target or BENCHMARK_TARGET_DIR");
			}),
		).toThrow(new UsageError("Provide --target or BENCHMARK_TARGET_DIR"));
	});

	it("returns the parsed configuration when parsing succeeds", () => {
		expect(asUsageError(() => "parsed")).toBe("parsed");
	});
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

	it("declares --corpus once, as one shared definition", () => {
		const declarations = COMMANDS.flatMap((command) =>
			command.flags.filter((flag) => flag.name === "--corpus"),
		);

		expect(declarations.length).toBeGreaterThan(1);
		expect(new Set(declarations).size).toBe(1);
	});
});
