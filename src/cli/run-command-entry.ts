import { DEFAULT_CASE_ID } from "#benchmark/config";
import type { CommandEntry } from "#cli/command-contract";
import {
	confirmationFlags,
	corpusFlag,
	jsonFlag,
	sessionFlags,
} from "#cli/command-flags";

import dispatchRun from "./run-command-dispatch";

const runCommandEntry: CommandEntry = {
	definition: {
		confinement: "by case",
		flags: [
			{
				defaultValue: DEFAULT_CASE_ID,
				envVar: "BENCHMARK_CASE",
				help: "Declared benchmark case under cases/ the run executes",
				kind: "value",
				name: "--case",
			},
			{
				envVar: "BENCHMARK_TARGET_DIR",
				help: "Target repository the pipeline runs in; defaults to the case's declared target",
				kind: "value",
				name: "--target",
			},
			...sessionFlags,
			corpusFlag,
			{
				defaultValue: "the case's declared pipeline",
				envVar: "BENCHMARK_PIPELINE",
				help: "Pipeline definition the run executes, overriding the case's",
				kind: "value",
				name: "--pipeline",
			},
			{
				help: "Stop with the candidate in the target for an interactive review; needs a terminal",
				kind: "switch",
				name: "--pause",
			},
			...confirmationFlags,
			jsonFlag,
		],
		name: "run",
		summary: "Run the pipeline against the target repository and grade it",
	},
	execute: dispatchRun,
};

export { runCommandEntry as default };
