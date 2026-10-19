import { describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";

import {
	CliTestWorkspace,
	failureOf,
	recordOutput,
} from "#cli/cli-test-support";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import { executeReplay, runReplayCommand } from "#cli/replay-command";
import writeReplayableRunManifest from "#cli/replay-test-support";

import { escapedCorpusReplay, sessionArgs } from "./replay-corpus-test-fixture";

const workspace = CliTestWorkspace.forEachTest();

const STORED_SPEND_CEILING_USD = 100;

const passingProbe = async (): Promise<void> => {
	await Promise.resolve();
};

const storedCeiling = async (): Promise<number> =>
	await Promise.resolve(STORED_SPEND_CEILING_USD);

async function carriesTheCorpusSourceThroughToTheReplay(): Promise<void> {
	const corpora: (string | undefined)[] = [];
	const { output } = recordOutput();
	const manifestFile = await writeReplayableRunManifest("any-name-corpus");

	try {
		await runReplayCommand(
			{
				args: [
					"--run",
					"any-name-corpus",
					"--stage",
					"shape",
					...sessionArgs,
					"--corpus",
					"/some/corpus",
				],
				json: false,
				stdinIsTerminal: true,
			},
			{
				execute: async ({ config }) => {
					corpora.push(config.corpus);

					return await Promise.resolve({
						evidence: {
							lineage: "lineage-1",
							recordPath: "/runs/replay.json",
						},
						kind: "debug" as const,
					});
				},
				output,
				probeModel: passingProbe,
				requireSpendCeiling: storedCeiling,
				resolveRunDirectory: async () =>
					await Promise.resolve("/runs/any-name"),
			},
		);

		expect(corpora).toEqual(["/some/corpus"]);
	} finally {
		await rm(manifestFile, { force: true });
	}
}

async function refusesACorpusWhoseCLAUDEMdIsASymlink(): Promise<void> {
	const execution = await escapedCorpusReplay(workspace);

	const failure = await failureOf(
		executeReplay(execution, {
			output: recordOutput().output,
			spendCeilingUsd: 100,
		}),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).not.toContain("SECRET BYTES");
}

describe("--corpus on a stage replay", () => {
	it(
		"carries the corpus source through to the replay",
		carriesTheCorpusSourceThroughToTheReplay,
	);
	it(
		"refuses a corpus whose CLAUDE.md is a symlink out of the root, as a precondition",
		refusesACorpusWhoseCLAUDEMdIsASymlink,
	);
});
