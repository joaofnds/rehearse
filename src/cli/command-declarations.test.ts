import { describe, expect, it } from "bun:test";

import type { CommandDefinition } from "#cli/commands";
import { COMMANDS, commandHelp, topLevelHelp } from "#cli/commands";

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

function namesEveryDeclaredFlagWithItsDefaultAndEnvironment(): void {
	const help = commandHelp(exampleCommand);

	expect(help).toContain("--model");
	expect(help).toContain("BENCHMARK_MODEL");
	expect(help).toContain("sonnet");
	expect(help).toContain("Model every workflow session uses");
	expect(help).toContain("--yes");
	expect(help).toContain("Approve the projected cost without a prompt");
}

function listsEveryCommandWithItsSummaryAndTheExit(): void {
	const help = topLevelHelp();

	for (const command of COMMANDS) {
		expect(help).toContain(command.name);
		expect(help).toContain(command.summary);
	}
	expect(help).toContain("0  the command completed and wrote its record");
	expect(help).toContain("1  execution failure");
	expect(help).toContain("2  usage error");
	expect(help).toContain("3  refused precondition");
}

function declaresRunReplayCompareDiagnoseTheRecordReadersAnd(): void {
	expect(COMMANDS.map((command) => command.name)).toEqual([
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
	]);
}

function omitsTheFlagsHeadingForACommandThatDeclares(): void {
	const help = commandHelp({
		argument: "kind",
		confinement: "never",
		flags: [],
		name: "list",
		summary: "List the records",
	});

	expect(help).not.toContain("Flags:");
	expect(help).toBe("Usage: rehearse list <kind>\n\nList the records\n");
}

function declaresTheRunFlagsTheCardNames(): void {
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
		"--approved-in-browser",
		"--json",
	]);
}

describe(commandHelp.name, () => {
	it(
		"names every declared flag with its default and environment variable",
		namesEveryDeclaredFlagWithItsDefaultAndEnvironment,
	);
});

describe(topLevelHelp.name, () => {
	it(
		"lists every command with its summary and the exit-code meanings",
		listsEveryCommandWithItsSummaryAndTheExit,
	);
});

describe("declared commands", () => {
	it(
		"declares run, replay, compare, diagnose, the record readers, and the case verbs",
		declaresRunReplayCompareDiagnoseTheRecordReadersAnd,
	);
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
	it(
		"omits the flags heading for a command that declares none",
		omitsTheFlagsHeadingForACommandThatDeclares,
	);
	it("declares the run flags the card names", declaresTheRunFlagsTheCardNames);
});
