import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CorpusConfigurationError } from "#benchmark/corpus-file";
import { failureOf } from "#cli/cli-test-support";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import { replayCorpus } from "#cli/replay-command";

async function retainsTheCapturedLiveSourceAlongsideItsInstructions(): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-live-source-"));
	const source = {
		backingRoot: join(root, "backing"),
		kind: "live",
		root,
	} as const;
	await Bun.write(join(root, "CLAUDE.md"), "captured instructions\n");

	try {
		const corpus = await replayCorpus(
			undefined,
			async () => await Promise.resolve(source),
		);

		expect(corpus).toEqual({
			instructions: "captured instructions\n",
			setup: undefined,
			source,
		});
	} finally {
		await rm(root, { force: true, recursive: true });
	}
}

async function runsTheSessionWithTheActualSetupFor(): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-linked-source-"));
	const source = { kind: "directory", root } as const;
	await Bun.write(join(root, "CLAUDE.md"), "linked instructions\n");

	try {
		const corpus = await replayCorpus(
			undefined,
			async () => await Promise.resolve(source),
		);

		expect(corpus.setup).toBe("actual");
	} finally {
		await rm(root, { force: true, recursive: true });
	}
}

async function classifiesInvalidLiveCorpusConfigurationAsARefusedPrecondition(): Promise<void> {
	const failure = await failureOf(
		replayCorpus(
			undefined,
			async () =>
				await Promise.reject(
					new CorpusConfigurationError("invalid backing root"),
				),
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain("invalid backing root");
}

describe(replayCorpus.name, () => {
	it(
		"retains the captured live source alongside its instructions",
		retainsTheCapturedLiveSourceAlongsideItsInstructions,
	);
	it(
		"runs the session with the actual setup for a linked directory nobody named",
		runsTheSessionWithTheActualSetupFor,
	);
	it(
		"classifies invalid live corpus configuration as a refused precondition",
		classifiesInvalidLiveCorpusConfigurationAsARefusedPrecondition,
	);
});
