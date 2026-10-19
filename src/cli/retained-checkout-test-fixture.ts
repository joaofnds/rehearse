import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCommand } from "#benchmark/command";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import { recordRetentionRef } from "#benchmark/target";
import type { TestResources } from "#benchmark/test-support";
import { commitAll } from "#benchmark/test-support";

const RETAINED_RUN_NAME = "2026-09-03T00-00-00.000Z";
interface CheckoutFixture {
	readonly runsDirectory: string;
	readonly targetDirectory: string;
	readonly resultSha: string;
	readonly checkoutPath: string;
}

async function recordRepositories(
	fixture: CheckoutFixture,
	repositories: { readonly sourceRoot: string; readonly targetRoot: string },
): Promise<void> {
	await Bun.write(
		benchmarkRunPaths(fixture.runsDirectory, RETAINED_RUN_NAME).artifactFile,
		JSON.stringify({
			status: "AWAITING_HUMAN_REVIEW",
			...repositories,
			resultSha: fixture.resultSha,
		}),
	);
}

async function retainedRun(
	resources: Readonly<TestResources>,
): Promise<CheckoutFixture> {
	const target = await resources.createRepository();
	const runsDirectory = await mkdtemp(join(tmpdir(), "rehearse-runs-"));
	resources.track(runsDirectory);
	await Bun.write(
		benchmarkRunPaths(runsDirectory, RETAINED_RUN_NAME).artifactFile,
		JSON.stringify({
			resultSha: target.sha,
			sourceRoot: target.directory,
			status: "AWAITING_HUMAN_REVIEW",
		}),
	);
	await recordRetentionRef(target.directory, RETAINED_RUN_NAME, target.sha);
	const checkoutRoot = await mkdtemp(join(tmpdir(), "rehearse-checkout-"));
	resources.track(checkoutRoot);
	const checkoutPath = join(checkoutRoot, "candidate");
	resources.trackWorktree(target.directory, checkoutPath);

	return {
		checkoutPath,
		resultSha: target.sha,
		runsDirectory,
		targetDirectory: target.directory,
	};
}
async function removeRetainedTarget(fixture: CheckoutFixture): Promise<void> {
	await rm(fixture.targetDirectory, { force: true, recursive: true });
}

interface RetainedRepository {
	readonly directory: string;
	readonly sha: string;
}
async function laterRetainedCheckout(
	resources: Readonly<TestResources>,
): Promise<RetainedRepository> {
	const checkout = await resources.createRepository();
	await Bun.write(join(checkout.directory, "later.txt"), crypto.randomUUID());
	await commitAll(checkout.directory, "chore: later");
	const pinned = await runCommand(
		["git", "rev-parse", "HEAD"],
		checkout.directory,
	);
	const sha = pinned.trim();
	await recordRetentionRef(checkout.directory, RETAINED_RUN_NAME, sha);
	return { directory: checkout.directory, sha };
}

export {
	laterRetainedCheckout,
	recordRepositories,
	removeRetainedTarget,
	RETAINED_RUN_NAME,
	retainedRun,
};
export type { CheckoutFixture };
