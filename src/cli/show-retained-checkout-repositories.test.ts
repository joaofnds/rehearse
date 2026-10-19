import { describe, expect, it } from "bun:test";
import { dirname, join } from "node:path";

import { runCommand } from "#benchmark/command";
import { recordRetentionRef } from "#benchmark/target";
import { cloneTarget } from "#benchmark/target-clone";
import { TestResources } from "#benchmark/test-support";
import { recordOutput } from "#cli/cli-test-support";
import { runShow } from "#cli/show-command";

import {
	RETAINED_RUN_NAME,
	laterRetainedCheckout,
	recordRepositories,
	retainedRun,
} from "./retained-checkout-test-fixture";

const resources = TestResources.forEachTest();

async function addsTheWorktreeFromTheTargetTheRunS(): Promise<void> {
	const fixture = await retainedRun(resources);
	await recordRepositories(fixture, {
		sourceRoot: join(fixture.runsDirectory, "removed-checkout"),
		targetRoot: fixture.targetDirectory,
	});

	await runShow(
		{
			checkout: fixture.checkoutPath,
			id: `run:${RETAINED_RUN_NAME}`,
			json: false,
			runsDirectory: fixture.runsDirectory,
		},
		recordOutput().output,
	);

	const head = await runCommand(
		["git", "rev-parse", "HEAD"],
		fixture.checkoutPath,
	);
	expect(head.trim()).toBe(fixture.resultSha);
}

async function checksOutTheCandidateTheCheckoutPinnedThoughThe(): Promise<void> {
	const fixture = await retainedRun(resources);
	const checkout = await laterRetainedCheckout(resources);
	resources.trackWorktree(checkout.directory, fixture.checkoutPath);
	await recordRepositories(fixture, {
		sourceRoot: checkout.directory,
		targetRoot: fixture.targetDirectory,
	});

	await runShow(
		{
			checkout: fixture.checkoutPath,
			id: `run:${RETAINED_RUN_NAME}`,
			json: false,
			runsDirectory: fixture.runsDirectory,
		},
		recordOutput().output,
	);

	const head = await runCommand(
		["git", "rev-parse", "HEAD"],
		fixture.checkoutPath,
	);
	expect(head.trim()).toBe(checkout.sha);
}

async function addsTheWorktreeInTheTargetWhichOutlivesThe(): Promise<void> {
	const fixture = await retainedRun(resources);
	const checkout = await cloneTarget(fixture.targetDirectory);
	resources.track(dirname(checkout));
	await recordRetentionRef(checkout, RETAINED_RUN_NAME, fixture.resultSha);
	await recordRepositories(fixture, {
		sourceRoot: checkout,
		targetRoot: fixture.targetDirectory,
	});

	await runShow(
		{
			checkout: fixture.checkoutPath,
			id: `run:${RETAINED_RUN_NAME}`,
			json: false,
			runsDirectory: fixture.runsDirectory,
		},
		recordOutput().output,
	);

	const worktrees = await runCommand(
		["git", "worktree", "list"],
		fixture.targetDirectory,
	);
	expect(worktrees).toContain(fixture.checkoutPath);
}

function whenTheRunsCheckoutIsGoneCases(): void {
	it(
		"adds the worktree from the target the run's commits were copied into",
		addsTheWorktreeFromTheTargetTheRunS,
	);
}

function whenTheRunsCheckoutRemainsCases(): void {
	it(
		"checks out the candidate the checkout pinned, though the target holds an older one",
		checksOutTheCandidateTheCheckoutPinnedThoughThe,
	);
	it(
		"adds the worktree in the target, which outlives the checkout, when both hold the candidate",
		addsTheWorktreeInTheTargetWhichOutlivesThe,
	);
}

function runShowCases(): void {
	describe("when the run's checkout is gone", whenTheRunsCheckoutIsGoneCases);
	describe("when the run's checkout remains", whenTheRunsCheckoutRemainsCases);
}

describe(runShow.name, runShowCases);
