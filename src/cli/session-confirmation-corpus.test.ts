import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { CorpusConfigurationError } from "#benchmark/corpus-file";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { TestResources } from "#benchmark/test-support";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { UsageError } from "#cli/command-usage";
import { executeSessionRun, runRunCommand } from "#cli/run-command";

import {
	SessionCaseBuilder,
	missingPreflight,
	smokeCase,
} from "./run-command-test-fixture";
import {
	SessionRequestBuilder,
	sessionCommandDependencies,
} from "./session-command-test-boundaries";

const testResources = TestResources.forEachTest();

async function classifiesAnInvalidConfirmedSessionCorpusAsAUsage(): Promise<void> {
	const { output } = recordOutput();
	const runsDirectory = await testResources.createControlDirectory();
	const calls: string[] = [];
	const missingCorpus = join(runsDirectory, "missing-corpus");

	const dependencies = sessionCommandDependencies({
		executeSession: async (execution, boundary) =>
			await executeSessionRun(execution, {
				...boundary,
				executeAttempt: async () => {
					calls.push("rep");

					return await Promise.reject(new Error("must not run"));
				},
				runsDirectory,
			}),
		output,
		probeModel: async () => {
			calls.push("probe");

			return await Promise.resolve(missingPreflight);
		},
	});
	const failure = await failureOf(
		runRunCommand(
			new SessionRequestBuilder({}, [
				"--corpus",
				missingCorpus,
				"--confirm",
				"--reps",
				"2",
				"--yes",
			]).build(),
			dependencies,
		),
	);

	expect(failure).toBeInstanceOf(UsageError);
	expect(calls).toEqual(["probe"]);
}

async function classifiesInvalidLiveCorpusConfigurationConsistentlyForConfirmation(): Promise<void> {
	const { output } = recordOutput();
	const runsDirectory = await testResources.createControlDirectory();
	const calls: string[] = [];

	const dependencies = sessionCommandDependencies({
		executeSession: async (execution, boundary) =>
			await executeSessionRun(execution, {
				...boundary,
				executeAttempt: async () => {
					calls.push("rep");

					return await Promise.reject(new Error("must not run"));
				},
				resolveCorpus: async () =>
					await Promise.reject(
						new CorpusConfigurationError("invalid backing root"),
					),
				runsDirectory,
			}),
		output,
		probeModel: async () => {
			calls.push("probe");

			return await Promise.resolve(missingPreflight);
		},
	});
	const failure = await failureOf(
		runRunCommand(
			new SessionRequestBuilder({}, [
				"--confirm",
				"--reps",
				"2",
				"--yes",
			]).build(),
			dependencies,
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("invalid backing root");
	expect(calls).toEqual(["probe"]);
}

async function admitsGlobalCorpusInput(corpusFile: string): Promise<void> {
	const { output } = recordOutput();
	const calls: string[] = [];
	const corpusRoot = await testResources.createControlDirectory();
	const runsDirectory = await testResources.createControlDirectory();
	await Bun.write(join(corpusRoot, corpusFile), "declared corpus\n");
	const globalCase = new SessionCaseBuilder({
		corpusFiles: [corpusFile],
		declaration: { ...smokeCase.declaration, corpusFiles: [corpusFile] },
	}).build();

	const dependencies = sessionCommandDependencies({
		executeSession: async (execution, boundary) =>
			await executeSessionRun(execution, {
				...boundary,
				executeAttempt: async () => {
					calls.push("rep");

					return await Promise.reject(new Error("rep reached"));
				},
				runsDirectory,
			}),
		output,
		probeModel: async () => {
			calls.push("probe");

			return await Promise.resolve(missingPreflight);
		},
		requireCase: async () => await Promise.resolve(globalCase),
	});
	await failureOf(
		runRunCommand(
			new SessionRequestBuilder({}, [
				"--corpus",
				corpusRoot,
				"--confirm",
				"--reps",
				"2",
				"--yes",
			]).build(),
			dependencies,
		),
	);

	expect(calls).toEqual(["probe", "rep", "rep"]);
}

describe("runRunCommand for a session case", () => {
	it.each(["CLAUDE.md", "skills/build/SKILL.md"])(
		"admits global corpus input %s to a confirmation group",
		admitsGlobalCorpusInput,
	);
});

describe("runRunCommand for a session case", () => {
	it(
		"classifies an invalid confirmed session corpus as a usage error",
		classifiesAnInvalidConfirmedSessionCorpusAsAUsage,
	);
	it(
		"classifies invalid live corpus configuration consistently for confirmation",
		classifiesInvalidLiveCorpusConfigurationConsistentlyForConfirmation,
	);
});
