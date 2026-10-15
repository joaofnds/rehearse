import { describe, expect, it } from "bun:test";
import { dirname, join } from "node:path";
import { RunCommitGoneError, repositoryHolding } from "./run-repositories";
import { runCommand } from "./command";
import { cloneTarget } from "./target-clone";
import { failureOf } from "#cli/cli-test-support";
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

describe(repositoryHolding.name, () => {
	it("reads the commit from the target the run copied it into, though the checkout remains", async () => {
		const target = await testResources.createRepository();
		const checkout = await checkoutOf(target);

		const root = await repositoryHolding(
			{ target: target.directory, checkout, declared: undefined },
			target.sha,
		);

		expect(root).toBe(target.directory);
	});

	it("reads the commit from the run's checkout when the target lacks it", async () => {
		const target = await testResources.createRepository();
		const checkout = await repositoryAhead();

		const root = await repositoryHolding(
			{
				target: target.directory,
				checkout: checkout.directory,
				declared: undefined,
			},
			checkout.sha,
		);

		expect(root).toBe(checkout.directory);
	});

	it("reads the commit from the case's declared target when neither the target nor the checkout holds it", async () => {
		const target = await testResources.createRepository();
		const declared = await repositoryAhead();

		const root = await repositoryHolding(
			{
				target: target.directory,
				checkout: join(target.directory, "removed-checkout"),
				declared: declared.directory,
			},
			declared.sha,
		);

		expect(root).toBe(declared.directory);
	});

	describe("when no repository holds the commit", () => {
		it("refuses, naming every repository it searched", async () => {
			const target = await testResources.createRepository();
			const declared = await testResources.createRepository();
			const removed = join(target.directory, "removed-checkout");
			const elsewhere = await repositoryAhead();

			const failure = await failureOf(
				repositoryHolding(
					{
						target: target.directory,
						checkout: removed,
						declared: declared.directory,
					},
					elsewhere.sha,
				),
			);

			expect(failure).toBeInstanceOf(RunCommitGoneError);
			expect(failure).toMatchObject({
				searched: [target.directory, removed, declared.directory],
			});
		});

		it("searches a repository the run names twice once", async () => {
			const target = await testResources.createRepository();
			const elsewhere = await repositoryAhead();

			const failure = await failureOf(
				repositoryHolding(
					{
						target: undefined,
						checkout: target.directory,
						declared: target.directory,
					},
					elsewhere.sha,
				),
			);

			expect(failure).toMatchObject({ searched: [target.directory] });
		});
	});
});
