import { describe, expect, it } from "bun:test";
import { chmod } from "node:fs/promises";
import { dirname, join } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import { runCommand } from "./command";
import { pathExists } from "./file-presence";
import { recordRetentionRef } from "./target";
import {
	CommitsNotCopiedError,
	cloneTarget,
	releaseClone,
	retainInTarget,
} from "./target-clone";
import { TestResources, commitAll } from "./test-support";

const OWNER_READ_ONLY_DIRECTORY_MODE = 0o500;

const OWNER_DIRECTORY_MODE = 0o700;

const testResources = TestResources.forEachTest();

const retainInTargetCopiesTheRunsRetentionRefAndTheCommitItKeepsIntoTheTarget =
	async (): Promise<void> => {
		const target = await testResources.createRepository();
		const clone = await testResources.createRepository();
		await Bun.write(join(clone.directory, "candidate.txt"), "candidate\n");
		await commitAll(clone.directory, "feat: candidate");
		const candidate = await retainHead(clone.directory, "run-1");

		await retainInTarget(clone.directory, target.directory, "run-1");

		expect(await retainedCommit(target.directory, "run-1")).toBe(candidate);
	};

const retainInTargetCopiesNothingWhenTheCloneRetainedNothingForTheRun =
	async (): Promise<void> => {
		const target = await testResources.createRepository();
		const clone = await testResources.createRepository();

		await retainInTarget(clone.directory, target.directory, "run-1");

		const refs = await runCommand(
			["git", "for-each-ref", "refs/rehearse"],
			target.directory,
		);

		expect(refs).toBe("");
	};

const releaseCloneRemovesTheCloneOnceTheTargetHoldsTheRunsCommits =
	async (): Promise<void> => {
		const target = await testResources.createRepository();
		const clone = await cloneTarget(target.directory);
		testResources.track(dirname(clone));
		await retainHead(clone, "run-1");

		await releaseClone(clone, target.directory, "run-1");

		expect(await pathExists(dirname(clone))).toBe(false);
	};

const releaseCloneWhenTheTargetCannotTakeTheRunsCommitsRefusesNamingTheCloneItKeeps =
	async (): Promise<void> => {
		const target = await testResources.createRepository();
		const clone = await cloneTarget(target.directory);
		testResources.track(dirname(clone));
		await retainHead(clone, "run-1");
		const missingTarget = join(dirname(clone), "moved-away");

		const failure = await failureOf(
			releaseClone(clone, missingTarget, "run-1"),
		);

		expect(failure).toBeInstanceOf(CommitsNotCopiedError);
	};

const releaseCloneWhenTheTargetCannotTakeTheRunsCommitsKeepsTheCloneWhichHoldsTheirOnly =
	async (): Promise<void> => {
		const target = await testResources.createRepository();
		const clone = await cloneTarget(target.directory);
		testResources.track(dirname(clone));
		await retainHead(clone, "run-1");
		const missingTarget = join(dirname(clone), "moved-away");

		await failureOf(releaseClone(clone, missingTarget, "run-1"));

		expect(await pathExists(clone)).toBe(true);
	};

const releaseCloneWhenTheCloneCannotBeRemovedReportsTheRemovalWithTheCommitsAlreadyInThe =
	async (): Promise<void> => {
		const target = await testResources.createRepository();
		const clone = await cloneTarget(target.directory);
		testResources.track(dirname(clone));
		const candidate = await retainHead(clone, "run-1");
		await chmod(dirname(clone), OWNER_READ_ONLY_DIRECTORY_MODE);

		const failure = await failureOf(
			releaseClone(clone, target.directory, "run-1"),
		);
		await chmod(dirname(clone), OWNER_DIRECTORY_MODE);

		expect(failure).toBeInstanceOf(Error);
		expect(failure).not.toBeInstanceOf(CommitsNotCopiedError);
		expect(await retainedCommit(target.directory, "run-1")).toBe(candidate);
	};

describe(retainInTarget.name, () => {
	it(
		"copies the run's retention ref and the commit it keeps into the target",
		retainInTargetCopiesTheRunsRetentionRefAndTheCommitItKeepsIntoTheTarget,
	);

	it(
		"copies nothing when the clone retained nothing for the run",
		retainInTargetCopiesNothingWhenTheCloneRetainedNothingForTheRun,
	);
});

describe(releaseClone.name, () => {
	it(
		"removes the clone once the target holds the run's commits",
		releaseCloneRemovesTheCloneOnceTheTargetHoldsTheRunsCommits,
	);

	describe("when the target cannot take the run's commits", () => {
		it(
			"refuses, naming the clone it keeps",
			releaseCloneWhenTheTargetCannotTakeTheRunsCommitsRefusesNamingTheCloneItKeeps,
		);

		it(
			"keeps the clone, which holds their only copy",
			releaseCloneWhenTheTargetCannotTakeTheRunsCommitsKeepsTheCloneWhichHoldsTheirOnly,
		);
	});

	describe("when the clone cannot be removed", () => {
		it(
			"reports the removal, with the commits already in the target",
			releaseCloneWhenTheCloneCannotBeRemovedReportsTheRemovalWithTheCommitsAlreadyInThe,
		);
	});
});

async function retainedCommit(
	repository: string,
	runName: string,
): Promise<string> {
	const output = await runCommand(
		[
			"git",
			"rev-parse",
			"--verify",
			"--quiet",
			`refs/rehearse/${runName}^{commit}`,
		],
		repository,
	);

	return output.trim();
}

async function retainHead(
	repository: string,
	runName: string,
): Promise<string> {
	const output = await runCommand(["git", "rev-parse", "HEAD"], repository);
	const head = output.trim();
	await recordRetentionRef(repository, runName, head);

	return head;
}
