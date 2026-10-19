import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { runCommand } from "#benchmark/command";
import { DEFAULT_CASE_ID } from "#benchmark/config";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { TestResources } from "#benchmark/test-support";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import { UsageError } from "#cli/command-usage";
import { runShow } from "#cli/show-command";

import {
	RETAINED_RUN_NAME,
	removeRetainedTarget,
	retainedRun,
} from "./retained-checkout-test-fixture";

const resources = TestResources.forEachTest();

async function addsADetachedWorktreeOfTheRetainedCandidateAnd(): Promise<void> {
	const fixture = await retainedRun(resources);
	const { output, stdout, stderr } = recordOutput();

	await runShow(
		{
			checkout: fixture.checkoutPath,
			id: `run:${RETAINED_RUN_NAME}`,
			json: false,
			runsDirectory: fixture.runsDirectory,
		},
		output,
	);

	expect(stdout).toEqual([`${fixture.checkoutPath}\n`]);
	expect(stderr).toEqual([]);
	const head = await runCommand(
		["git", "rev-parse", "HEAD"],
		fixture.checkoutPath,
	);
	expect(head.trim()).toBe(fixture.resultSha);
}

async function refusesADirectoryThatAlreadyExistsAndCreatesNo(): Promise<void> {
	const fixture = await retainedRun(resources);
	await Bun.write(join(fixture.checkoutPath, "already"), "there\n");
	const { output, stdout } = recordOutput();

	const failure = await failureOf(
		runShow(
			{
				checkout: fixture.checkoutPath,
				id: `run:${RETAINED_RUN_NAME}`,
				json: false,
				runsDirectory: fixture.runsDirectory,
			},
			output,
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain(fixture.checkoutPath);
	expect(stdout).toEqual([]);
	const worktrees = await runCommand(
		["git", "worktree", "list"],
		fixture.targetDirectory,
	);
	expect(worktrees).not.toContain(fixture.checkoutPath);
}

async function refusesATargetHoldingNoRetentionRefForThe(): Promise<void> {
	const fixture = await retainedRun(resources);
	await runCommand(
		["git", "update-ref", "-d", `refs/rehearse/${RETAINED_RUN_NAME}`],
		fixture.targetDirectory,
	);
	const { output } = recordOutput();

	const failure = await failureOf(
		runShow(
			{
				checkout: fixture.checkoutPath,
				id: `run:${RETAINED_RUN_NAME}`,
				json: false,
				runsDirectory: fixture.runsDirectory,
			},
			output,
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain(`refs/rehearse/${RETAINED_RUN_NAME}`);
}

async function refusesATargetRepositoryItCannotReadNamingThe(): Promise<void> {
	const fixture = await retainedRun(resources);
	await removeRetainedTarget(fixture);
	const { output } = recordOutput();

	const failure = await failureOf(
		runShow(
			{
				checkout: fixture.checkoutPath,
				id: `run:${RETAINED_RUN_NAME}`,
				json: false,
				runsDirectory: fixture.runsDirectory,
			},
			output,
		),
	);

	expect(failure).toBeInstanceOf(RefusedPreconditionError);
	expect(failure.message).toContain(fixture.targetDirectory);
	expect(failure.message).not.toContain("retained no candidate");
}

async function refusesCheckoutOnAnIdThatIsNotA(): Promise<void> {
	const fixture = await retainedRun(resources);
	const { output } = recordOutput();

	const failure = await failureOf(
		runShow(
			{
				checkout: fixture.checkoutPath,
				id: `case:${DEFAULT_CASE_ID}`,
				json: false,
				runsDirectory: fixture.runsDirectory,
			},
			output,
		),
	);

	expect(failure).toBeInstanceOf(UsageError);
	expect(failure.message).toContain("--checkout");
	expect(failure.message).toContain("run id");
}

async function acceptsTheRunUnderABareNameAsWell(): Promise<void> {
	const fixture = await retainedRun(resources);
	const { output, stdout } = recordOutput();

	await runShow(
		{
			checkout: fixture.checkoutPath,
			id: RETAINED_RUN_NAME,
			json: false,
			runsDirectory: fixture.runsDirectory,
		},
		output,
	);

	expect(stdout).toEqual([`${fixture.checkoutPath}\n`]);
}

describe("show --checkout", () => {
	it(
		"adds a detached worktree of the retained candidate and prints its path",
		addsADetachedWorktreeOfTheRetainedCandidateAnd,
	);
	it(
		"refuses a directory that already exists and creates no worktree",
		refusesADirectoryThatAlreadyExistsAndCreatesNo,
	);
	it(
		"refuses a target holding no retention ref for the run",
		refusesATargetHoldingNoRetentionRefForThe,
	);
	it(
		"refuses a target repository it cannot read, naming the path",
		refusesATargetRepositoryItCannotReadNamingThe,
	);
	it(
		"refuses --checkout on an id that is not a run",
		refusesCheckoutOnAnIdThatIsNotA,
	);
	it(
		"accepts the run under a bare name as well as run:<name>",
		acceptsTheRunUnderABareNameAsWell,
	);
});
