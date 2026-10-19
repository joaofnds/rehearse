import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";

import { RefusedPreconditionError } from "#benchmark/exit-codes";
import {
	CliTestWorkspace,
	failureOf,
	recordOutput,
} from "#cli/cli-test-support";
import { UsageError } from "#cli/command-usage";
import { runCompareExtendCommand } from "#cli/compare-attempts-command";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

import { savedComparison } from "./comparison-recording-test-fixture";

const workspace = CliTestWorkspace.forEachTest();

const REPLAY_KNOB_VARIABLES = [
	"BENCHMARK_MODEL",
	"BENCHMARK_EFFORT",
	"BENCHMARK_JUDGE_MODEL",
	"BENCHMARK_JUDGE_EFFORT",
	"BENCHMARK_SESSION_BUDGET_USD",
] as const;

const hostKnobs = new Map<string, string | undefined>();

beforeEach(() => {
	for (const name of REPLAY_KNOB_VARIABLES) {
		hostKnobs.set(name, Bun.env[name]);
		Reflect.deleteProperty(Bun.env, name);
	}
});

afterEach(() => {
	for (const [name, value] of hostKnobs) {
		if (value === undefined) {
			Reflect.deleteProperty(Bun.env, name);
		} else {
			Bun.env[name] = value;
		}
	}
});

const refusingReplay = {
	execute: async () => await Promise.reject(new Error("replay must not run")),
	probeModel: async () => await Promise.reject(new Error("must not probe")),
	prompt: async () => await Promise.reject(new Error("must not ask")),
	requireSpendCeiling: async () =>
		await Promise.reject(new Error("must not read")),
	resolveRunDirectory: async () =>
		await Promise.reject(new Error("must not resolve")),
};

const request = {
	approvedInBrowser: false,
	attempts: "2",
	comparison: "0".repeat(SHA256_HEX_DIGITS),
	json: false,
	runsDirectory: "/runs",
	stdinIsTerminal: false,
	yes: true,
};

async function statesTheAddedAttemptsCostAsksOnceReplaysEvery(): Promise<void> {
	const { arms, comparison, replay } = await savedComparison(workspace);
	const { stdout, stderr } = replay.recorder;
	const prompts: string[] = [];

	await runCompareExtendCommand(
		{
			...request,
			comparison: `comparison:${comparison}`,
			runsDirectory: arms.runsDirectory,
			stdinIsTerminal: true,
			yes: false,
		},
		{
			execute: replay.execute,
			output: replay.output,
			probeModel: replay.probeModel,
			prompt: async (message) => {
				prompts.push(message);

				return await Promise.resolve("y");
			},
			requireSpendCeiling: replay.requireSpendCeiling,
			resolveRunDirectory: replay.resolveRunDirectory,
		},
	);

	expect(stderr.join("")).toStartWith(
		"Adding 2 attempts to each arm costs about $9.00, at each arm's mean recorded cost per attempt.\n",
	);
	expect(prompts).toEqual(["Add the attempts? [y/N] "]);
	expect(
		replay.configs.map(({ stageSkill, confirmation }) => ({
			confirmation,
			stageSkill,
		})),
	).toEqual([
		{ confirmation: { approval: "yes", reps: 2 }, stageSkill: "installed" },
		{ confirmation: { approval: "yes", reps: 2 }, stageSkill: "installed" },
		{ confirmation: { approval: "yes", reps: 2 }, stageSkill: "absent" },
	]);
	const printed = stdout.join("");
	expect(printed).toStartWith(join(arms.runsDirectory, "comparisons"));
	expect(printed).not.toContain(comparison);
}

async function runsNothingWhenTheStatedCostIsDeclined(): Promise<void> {
	const { arms, comparison, replay } = await savedComparison(workspace);
	const { output } = recordOutput();

	const failure = await failureOf(
		runCompareExtendCommand(
			{
				...request,
				comparison,
				runsDirectory: arms.runsDirectory,
				stdinIsTerminal: true,
				yes: false,
			},
			{
				...refusingReplay,
				execute: replay.execute,
				output,
				prompt: async () => await Promise.resolve("n"),
			},
		),
	);

	expect(failure.message).toBe("Extension declined");
	expect(replay.configs).toEqual([]);
}

async function refusesToAskForApprovalWithNoTerminalTo(): Promise<void> {
	const { output } = recordOutput();

	const failure = await failureOf(
		runCompareExtendCommand(
			{ ...request, yes: false },
			{ ...refusingReplay, output },
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toBe(
		"stdin is not a terminal: approving the added attempts' cost needs a TTY; pass --yes instead",
	);
}

const refusesNameAsAUsageErrorExamples = [
	{
		change: { comparison: undefined },
		message:
			"Provide the comparison to extend by its manifest digest: rehearse compare extend --comparison <comparison:digest> --attempts <n>",
		name: "no comparison",
	},
	{
		change: { comparison: "../elsewhere" },
		message:
			"Provide the comparison to extend by its manifest digest: rehearse compare extend --comparison <comparison:digest> --attempts <n>",
		name: "a comparison that is not a manifest digest",
	},
	{
		change: { attempts: undefined },
		message:
			"Provide how many attempts to add to each arm as a positive whole number: --attempts <n>",
		name: "no attempts",
	},
	{
		change: { attempts: "0" },
		message:
			"Provide how many attempts to add to each arm as a positive whole number: --attempts <n>",
		name: "no positive whole number of attempts",
	},
	{
		change: { approvedInBrowser: true, yes: false },
		message: "Use --approved-in-browser only with --yes",
		name: "a browser approval without --yes",
	},
];

function describeWhenTheAdditionalCostIsApproved(): void {
	it(
		"states the added attempts' cost, asks once, replays every arm as approved and prints the new comparison's report",
		statesTheAddedAttemptsCostAsksOnceReplaysEvery,
	);
}
function describeWhenTheAdditionalCostIsDeclined(): void {
	it(
		"runs nothing when the stated cost is declined",
		runsNothingWhenTheStatedCostIsDeclined,
	);
}
function describeWhenTheRequestIsInvalid(): void {
	it.each(refusesNameAsAUsageErrorExamples)(
		"refuses $name as a usage error",
		async ({ change, message }) => {
			const { output } = recordOutput();

			const failure = await failureOf(
				runCompareExtendCommand(
					{ ...request, ...change },
					{ ...refusingReplay, output },
				),
			);

			expect(failure).toBeInstanceOf(UsageError);
			expect(failure.message).toBe(message);
		},
	);
}
function describeWhenStdinHasNoTerminal(): void {
	it(
		"refuses to ask for approval with no terminal to answer",
		refusesToAskForApprovalWithNoTerminalTo,
	);
}
describe(runCompareExtendCommand.name, () => {
	describe(
		"when the additional cost is approved",
		describeWhenTheAdditionalCostIsApproved,
	);
	describe(
		"when the additional cost is declined",
		describeWhenTheAdditionalCostIsDeclined,
	);
	describe("when the request is invalid", describeWhenTheRequestIsInvalid);
	describe("when stdin has no terminal", describeWhenStdinHasNoTerminal);
});
