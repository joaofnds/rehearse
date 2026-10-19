import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import { CommandError, runCommand } from "./command";
import {
	assertSourceReady,
	claimTarget,
	readRunMarker,
	refExists,
} from "./target";
import { TestResources } from "./test-support";

const CLAIMING_RUN = "2026-10-08T00-00-00.000Z";
const testResources = TestResources.forEachTest();
const findsARefTheRepositoryHolds = async (): Promise<void> => {
	const source = await testResources.createRepository();
	await runCommand(
		["git", "update-ref", "refs/rehearse/run-1", source.sha],
		source.directory,
	);

	expect(await refExists(source.directory, "refs/rehearse/run-1")).toBe(true);
};

const reportsARefTheRepositoryDoesNotHold = async (): Promise<void> => {
	const source = await testResources.createRepository();

	expect(await refExists(source.directory, "refs/rehearse/run-1")).toBe(false);
};

const raisesARepositoryItCannotReadRatherThanCallingTheRef = (): void => {
	const missing = join(tmpdir(), "rehearse-absent-repository");

	expect(refExists(missing, "refs/rehearse/run-1")).rejects.toThrow();
};

const raisesADirectoryThatHoldsNoRepository = async (): Promise<void> => {
	const plain = await mkdtemp(join(tmpdir(), "rehearse-plain-"));
	testResources.track(plain);

	expect(refExists(plain, "refs/rehearse/run-1")).rejects.toBeInstanceOf(
		CommandError,
	);
};

const recordsItsClaimInALinkedWorktreeWhoseGitIsA = async (): Promise<void> => {
	const source = await testResources.createRepository();
	await runCommand(["git", "switch", "-c", "primary"], source.directory);
	const worktreeParent = await mkdtemp(join(tmpdir(), "rehearse-worktree-"));
	testResources.track(worktreeParent);
	const worktree = join(worktreeParent, "main");
	await runCommand(
		["git", "worktree", "add", worktree, "main"],
		source.directory,
	);
	const baseline = await assertSourceReady(worktree);

	await claimTarget(baseline, CLAIMING_RUN);

	const marker = await readRunMarker(worktree);

	expect(marker?.run).toBe(CLAIMING_RUN);
};

const readsThePidAClaimRecordedForAStillclaimedTarget =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		const baseline = await assertSourceReady(source.directory);
		await claimTarget(baseline, CLAIMING_RUN);

		const marker = await readRunMarker(baseline.root);

		expect(marker?.pid).toBe(process.pid);
	};

const readsTheRunAClaimNames = async (): Promise<void> => {
	const source = await testResources.createRepository();
	const baseline = await assertSourceReady(source.directory);
	await claimTarget(baseline, CLAIMING_RUN);

	const marker = await readRunMarker(baseline.root);

	expect(marker?.run).toBe(CLAIMING_RUN);
};

const readsAClaimWrittenByACheckoutFromBeforeClaimsNamed =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		const baseline = await assertSourceReady(source.directory);
		await Bun.write(
			join(baseline.root, ".git", "benchmark-run.json"),
			JSON.stringify({
				pid: 4242,
				sha: baseline.sha,
				startedAt: "2026-09-01T00:00:00.000Z",
			}),
		);

		const marker = await readRunMarker(baseline.root);

		expect(marker).toEqual({
			pid: 4242,
			startedAt: "2026-09-01T00:00:00.000Z",
		});
	};

const reportsNoMarkerForATargetNothingHasClaimed = async (): Promise<void> => {
	const source = await testResources.createRepository();
	const baseline = await assertSourceReady(source.directory);

	expect(await readRunMarker(baseline.root)).toBeUndefined();
};

const reportsNoMarkerForACheckoutThatIsGoneSinceOnly =
	async (): Promise<void> => {
		const parent = await mkdtemp(join(tmpdir(), "rehearse-checkout-"));
		testResources.track(parent);

		expect(await readRunMarker(join(parent, "removed"))).toBeUndefined();
	};

const raisesItRatherThanReportingNoMarker = async (): Promise<void> => {
	const plain = await mkdtemp(join(tmpdir(), "rehearse-plain-"));
	testResources.track(plain);

	const failure = await failureOf(readRunMarker(plain));

	expect(failure).toBeInstanceOf(CommandError);
};
describe(refExists.name, () => {
	it("finds a ref the repository holds", findsARefTheRepositoryHolds);

	it(
		"reports a ref the repository does not hold",
		reportsARefTheRepositoryDoesNotHold,
	);

	/**
	 * A repository that has moved is not a run that retained nothing. Telling
	 * the two apart is what decides whether the caller goes looking for the
	 * repository or re-runs the benchmark, so the unreadable repository is
	 * raised rather than answered with false.
	 */
	it(
		"raises a repository it cannot read rather than calling the ref missing",
		raisesARepositoryItCannotReadRatherThanCallingTheRef,
	);

	it(
		"raises a directory that holds no repository",
		raisesADirectoryThatHoldsNoRepository,
	);
});
describe(claimTarget.name, () => {
	it(
		"records its claim in a linked worktree whose .git is a file",
		recordsItsClaimInALinkedWorktreeWhoseGitIsA,
	);
});
describe(readRunMarker.name, () => {
	it(
		"reads the pid a claim recorded for a still-claimed target",
		readsThePidAClaimRecordedForAStillclaimedTarget,
	);

	it("reads the run a claim names", readsTheRunAClaimNames);

	it(
		"reads a claim written by a checkout from before claims named their run",
		readsAClaimWrittenByACheckoutFromBeforeClaimsNamed,
	);

	it(
		"reports no marker for a target nothing has claimed",
		reportsNoMarkerForATargetNothingHasClaimed,
	);

	it(
		"reports no marker for a checkout that is gone, since only the run's end removes it",
		reportsNoMarkerForACheckoutThatIsGoneSinceOnly,
	);

	describe("when the directory is no checkout", () => {
		it(
			"raises it rather than reporting no marker",
			raisesItRatherThanReportingNoMarker,
		);
	});
});
