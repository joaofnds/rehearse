import { exists } from "node:fs/promises";

import { z } from "zod";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import { repositoryHolding } from "#benchmark/run-repositories";
import serialMap from "#benchmark/serial-map";
import { addWorktree, git, refExists, retentionRef } from "#benchmark/target";
import { UsageError } from "#cli/command-usage";
import { RefusedPreconditionError } from "#cli/interactive-stdin";
import type { RunRecordId } from "#cli/record-id";
import { parseRecordId, parseRunRecordId } from "#cli/record-id";

import { recordText } from "./record-file-location";

const EMPTY_COLLECTION_LENGTH = 0;

const retainedRunSchema = z
	.object({
		sourceRoot: z.string().nonempty(),
		targetRoot: z.string().nonempty().optional(),
	})
	.loose();

/**
 * The run recorded which repositories it worked in, so `--checkout` takes no
 * target of its own: a second answer could disagree with the first. The
 * candidate is the commit the run's retention ref names, and the worktree
 * goes where a replay reads the run's commits from.
 */
async function checkoutRetainedCandidate(
	given: string,
	directory: string,
	runsDirectory: string,
): Promise<string> {
	const id = parseCheckoutRunId(given);
	const { artifactFile } = benchmarkRunPaths(runsDirectory, id.run);
	const text = await recordText({ file: artifactFile, id: given });
	const run = retainedRunSchema.parse(JSON.parse(text));
	await refuseExistingDirectory(directory);
	const candidate = await retainedCandidate(run, id.run);
	const repository = await repositoryHolding(
		{ checkout: run.sourceRoot, declared: undefined, target: run.targetRoot },
		candidate,
	);
	await addWorktree(repository, candidate, directory);

	return directory;
}

/**
 * The commit the run's retention ref names, read from the run's checkout while
 * it remains: the target receives only what the checkout pinned, so a copy
 * that failed leaves the target's ref behind the checkout's. A repository
 * that is gone is not one that retained nothing, so when every one is gone
 * the caller is sent to find them rather than to re-run the benchmark.
 */
async function retainedCandidate(
	run: Readonly<z.infer<typeof retainedRunSchema>>,
	name: string,
): Promise<string> {
	const reference = retentionRef(name);
	const recorded = [run.sourceRoot, run.targetRoot].filter(
		(repository) => repository !== undefined,
	);
	const remaining = await remainingRecordedRepositories(recorded);
	if (remaining.length === EMPTY_COLLECTION_LENGTH) {
		throw new RefusedPreconditionError(
			`Cannot read ${recorded.join(" or ")}, which this run recorded; the candidate may still be retained wherever it is now`,
		);
	}

	for await (const inspection of serialMap(
		remaining.values(),
		async (repository) => ({
			repository,
			retains: await retainsCandidate(repository, reference),
		}),
	)) {
		const { repository, retains } = inspection;
		if (retains) {
			return await git(repository, "rev-parse", reference);
		}
	}

	throw new RefusedPreconditionError(
		`No ${reference} in ${remaining.join(" or ")}; run ${name} retained no candidate there`,
	);
}

async function remainingRecordedRepositories(
	recorded: readonly string[],
): Promise<readonly string[]> {
	const remaining: string[] = [];
	await Array.fromAsync(recorded, async (repository) => {
		if (await exists(repository)) {
			remaining.push(repository);
		}
	});

	return remaining;
}

/**
 * `--checkout` names one thing to materialize, and only a run retains a
 * candidate. A prefixed id of another kind is refused by name, so the caller
 * is told which id to give rather than failing later on a missing ref.
 */
function parseCheckoutRunId(given: string): RunRecordId {
	const parsed = given.includes(":")
		? parseRecordId(given)
		: parseRunRecordId(given);
	if (parsed.kind !== "run") {
		throw new UsageError(
			"--checkout takes a run id: rehearse show run:<name> --checkout <dir>",
		);
	}

	return parsed;
}

/**
 * The caller owns the directory they named and the harness never removes one,
 * so writing into a directory that is already there could bury work. Git would
 * refuse a non-empty one anyway; refusing here says why.
 */
async function refuseExistingDirectory(directory: string): Promise<void> {
	if (!(await exists(directory))) {
		return;
	}

	throw new RefusedPreconditionError(
		`${directory} already exists; --checkout writes a worktree into a new directory`,
	);
}

async function retainsCandidate(
	repository: string,
	reference: string,
): Promise<boolean> {
	try {
		return await refExists(repository, reference);
	} catch (error) {
		throw new RefusedPreconditionError(
			`Cannot read the repository at ${repository} this run recorded; the candidate may still be retained wherever it is now: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export { checkoutRetainedCandidate as default };
