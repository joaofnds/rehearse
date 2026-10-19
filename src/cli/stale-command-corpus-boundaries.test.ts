import { describe, expect, it } from "bun:test";
import { symlink } from "node:fs/promises";
import { join } from "node:path";

import { CorpusConfigurationError } from "#benchmark/corpus-file";
import type { ResolvedCorpusSource } from "#benchmark/corpus-source";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import runStale from "#cli/stale-command";

import StaleCorpusFixture from "./stale-corpus-test-fixture";

const corpusFixture = StaleCorpusFixture.forEachTest();

async function classifiesInvalidLiveCorpusConfigurationAsARefusedPrecondition(): Promise<void> {
	const failure = await failureOf(
		runStale(
			{ corpus: undefined, runsDirectory: "/unused" },
			{
				output: recordOutput().output,
				resolveCorpus: async () =>
					await Promise.reject(
						new CorpusConfigurationError("invalid backing root"),
					),
			},
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("invalid backing root");
}

async function refusesALiveCorpusWhoseBackingTreeIsInvalid(): Promise<void> {
	const root = await corpusFixture.temporaryDirectory("rehearse-stale-live-");
	const outside = await corpusFixture.temporaryDirectory(
		"rehearse-stale-outside-",
	);
	const backingRoot = join(
		await corpusFixture.temporaryDirectory("rehearse-stale-backing-"),
		"file",
	);
	await Bun.write(backingRoot, "not a directory\n");
	await Bun.write(join(outside, "CLAUDE.md"), "the instructions\n");
	await symlink(join(outside, "CLAUDE.md"), join(root, "CLAUDE.md"));

	const failure = await failureOf(
		runStale(
			{
				corpus: undefined,
				runsDirectory: await corpusFixture.temporaryDirectory(
					"rehearse-stale-runs-",
				),
			},
			{
				output: recordOutput().output,
				resolveCorpus: async () =>
					await Promise.resolve<ResolvedCorpusSource>({
						backingRoot,
						kind: "live",
						root,
					}),
			},
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("not a directory");
}

describe(runStale.name, () => {
	it(
		"classifies invalid live corpus configuration as a refused precondition",
		classifiesInvalidLiveCorpusConfigurationAsARefusedPrecondition,
	);
	it(
		"refuses a live corpus whose backing tree is invalid, with no record to judge",
		refusesALiveCorpusWhoseBackingTreeIsInvalid,
	);
});
