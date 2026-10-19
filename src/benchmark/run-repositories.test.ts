import { describe, expect, it } from "bun:test";
import { dirname, join } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import { runCommand } from "./command";
import { RunCommitGoneError, repositoryHolding } from "./run-repositories";
import { cloneTarget } from "./target-clone";
import { TestResources, commitAll } from "./test-support";
import type { TestRepository } from "./test-support";

const testResources = TestResources.forEachTest();

/** A repository whose head commit no other test repository holds. */
async function repositoryAhead(): Promise<TestRepository> {
	const repository = await testResources.createRepository();
	await Bun.write(join(repository.directory, "later.txt"), crypto.randomUUID());
	await commitAll(repository.directory, "chore: later");
	const head = await runCommand(
		["git", "rev-parse", "HEAD"],
		repository.directory,
	);

	return { directory: repository.directory, sha: head.trim() };
}

async function checkoutOf(target: TestRepository): Promise<string> {
	const checkout = await cloneTarget(target.directory);
	testResources.track(dirname(checkout));

	return checkout;
}

const repositoryHoldingReadsTheCommitFromTheTargetTheRunCopiedItIntoThoughTheCheckoutRemains =
	async (): Promise<void> => {
		const target = await testResources.createRepository();
		const checkout = await checkoutOf(target);

		const root = await repositoryHolding(
			{ checkout, declared: undefined, target: target.directory },
			target.sha,
		);

		expect(root).toBe(target.directory);
	};

const repositoryHoldingReadsTheCommitFromTheRunsCheckoutWhenTheTargetLacksIt =
	async (): Promise<void> => {
		const target = await testResources.createRepository();
		const checkout = await repositoryAhead();

		const root = await repositoryHolding(
			{
				checkout: checkout.directory,
				declared: undefined,
				target: target.directory,
			},
			checkout.sha,
		);

		expect(root).toBe(checkout.directory);
	};

const repositoryHoldingReadsTheCommitFromTheCasesDeclaredTargetWhenNeitherTheTargetNorTheCheckout =
	async (): Promise<void> => {
		const target = await testResources.createRepository();
		const declared = await repositoryAhead();

		const root = await repositoryHolding(
			{
				checkout: join(target.directory, "removed-checkout"),
				declared: declared.directory,
				target: target.directory,
			},
			declared.sha,
		);

		expect(root).toBe(declared.directory);
	};

const repositoryHoldingWhenNoRepositoryHoldsTheCommitRefusesNamingEveryRepositoryItSearched =
	async (): Promise<void> => {
		const target = await testResources.createRepository();
		const declared = await testResources.createRepository();
		const removed = join(target.directory, "removed-checkout");
		const elsewhere = await repositoryAhead();

		const failure = await failureOf(
			repositoryHolding(
				{
					checkout: removed,
					declared: declared.directory,
					target: target.directory,
				},
				elsewhere.sha,
			),
		);

		expect(failure).toBeInstanceOf(RunCommitGoneError);
		expect(failure).toMatchObject({
			searched: [target.directory, removed, declared.directory],
		});
	};

const repositoryHoldingWhenNoRepositoryHoldsTheCommitSearchesARepositoryTheRunNamesTwiceOnce =
	async (): Promise<void> => {
		const target = await testResources.createRepository();
		const elsewhere = await repositoryAhead();

		const failure = await failureOf(
			repositoryHolding(
				{
					checkout: target.directory,
					declared: target.directory,
					target: undefined,
				},
				elsewhere.sha,
			),
		);

		expect(failure).toMatchObject({ searched: [target.directory] });
	};

describe(repositoryHolding.name, () => {
	it(
		"reads the commit from the target the run copied it into, though the checkout remains",
		repositoryHoldingReadsTheCommitFromTheTargetTheRunCopiedItIntoThoughTheCheckoutRemains,
	);

	it(
		"reads the commit from the run's checkout when the target lacks it",
		repositoryHoldingReadsTheCommitFromTheRunsCheckoutWhenTheTargetLacksIt,
	);

	it(
		"reads the commit from the case's declared target when neither the target nor the checkout holds it",
		repositoryHoldingReadsTheCommitFromTheCasesDeclaredTargetWhenNeitherTheTargetNorTheCheckout,
	);

	describe("when no repository holds the commit", () => {
		it(
			"refuses, naming every repository it searched",
			repositoryHoldingWhenNoRepositoryHoldsTheCommitRefusesNamingEveryRepositoryItSearched,
		);

		it(
			"searches a repository the run names twice once",
			repositoryHoldingWhenNoRepositoryHoldsTheCommitSearchesARepositoryTheRunNamesTwiceOnce,
		);
	});
});
