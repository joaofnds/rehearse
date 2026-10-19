import type { FlagDefinition } from "#cli/command-contract";

const MISSING_SEQUENCE_INDEX = -1;
const OPTION_VALUE_OFFSET = 1;

const sessionFlags: readonly FlagDefinition[] = [
	{
		envVar: "BENCHMARK_MODEL",
		help: "Model every workflow session and the Product Owner use",
		kind: "value",
		name: "--model",
	},
	{
		envVar: "BENCHMARK_EFFORT",
		help: "Reasoning effort for the workflow: low, medium, high, xhigh, or max",
		kind: "value",
		name: "--effort",
	},
	{
		defaultValue: "opus, or sonnet when the workflow model is opus",
		envVar: "BENCHMARK_JUDGE_MODEL",
		help: "Model the stage and final Judges use",
		kind: "value",
		name: "--judge-model",
	},
	{
		defaultValue: "the workflow effort",
		envVar: "BENCHMARK_JUDGE_EFFORT",
		help: "Reasoning effort for the Judges",
		kind: "value",
		name: "--judge-effort",
	},
	{
		envVar: "BENCHMARK_SESSION_BUDGET_USD",
		help: "Spend limit enforced for each session",
		kind: "value",
		name: "--session-budget-usd",
	},
	{
		defaultValue: "B",
		envVar: "BENCHMARK_MINIMUM_GRADE",
		help: "Lowest stage grade a run continues past; the Judge still grades and records as it does now",
		kind: "value",
		name: "--minimum-grade",
	},
];

const corpusFlag: FlagDefinition = {
	defaultValue: "the linked corpus, or the live install when none is linked",
	help: "Corpus under test: a directory in corpus layout",
	kind: "value",
	name: "--corpus",
};

const confirmationFlags: readonly FlagDefinition[] = [
	{
		help: "Run a confirmation group instead of one debug rep",
		kind: "switch",
		name: "--confirm",
	},
	{
		defaultValue: "5",
		help: "Reps in the confirmation group; at least 2, only with --confirm",
		kind: "value",
		name: "--reps",
	},
	{
		help: "Approve the projected cost without a prompt, only with --confirm",
		kind: "switch",
		name: "--yes",
	},
	{
		help: "Record the --yes approval as given in the browser's launch dialog",
		kind: "switch",
		name: "--approved-in-browser",
	},
];

const jsonFlag: FlagDefinition = {
	help: "Print the record's own bytes on stdout instead of its path",
	kind: "switch",
	name: "--json",
};

function flagValue(flags: readonly string[], name: string): string | undefined {
	const index = flags.indexOf(name);

	return index === MISSING_SEQUENCE_INDEX
		? undefined
		: flags[index + OPTION_VALUE_OFFSET];
}

/**
 * A flag the caller may repeat, in the order they gave it: `--finding` names
 * one finding each time, and a review records them in that order.
 */
function repeatedFlagValues(
	flags: readonly string[],
	name: string,
): readonly string[] {
	const values: string[] = [];
	for (const [index, flag] of flags.entries()) {
		const value = flags[index + OPTION_VALUE_OFFSET];
		if (flag === name && value !== undefined) {
			values.push(value);
		}
	}

	return values;
}
export {
	confirmationFlags,
	corpusFlag,
	flagValue,
	jsonFlag,
	repeatedFlagValues,
	sessionFlags,
};
