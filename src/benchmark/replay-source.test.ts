import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { ReplaySourceGoneError, replaySourceRoot } from "./replay-source";
import { runCommand } from "./command";
import { failureOf } from "#cli/cli-test-support";
import { TestResources, commitAll } from "./test-support";

const testResources = TestResources.forEachTest();

describe(replaySourceRoot.name, () => {
	it("checks out from the repository the run recorded while it exists", async () => {
		const recorded = await testResources.createRepository();
		const declared = await testResources.createRepository();

		const root = await replaySourceRoot({
			recorded: recorded.directory,
			declared: declared.directory,
			sha: recorded.sha,
		});

		expect(root).toBe(recorded.directory);
	});

	describe("when the recorded repository is gone", () => {
		it("checks out from the case's declared target, which holds the commit", async () => {
			const declared = await testResources.createRepository();
			const gone = join(declared.directory, "deleted-clone");

			const root = await replaySourceRoot({
				recorded: gone,
				declared: declared.directory,
				sha: declared.sha,
			});

			expect(root).toBe(declared.directory);
		});

		it("refuses when the declared target lacks the commit", async () => {
			const declared = await testResources.createRepository();
			const clone = await testResources.createRepository();
			await Bun.write(join(clone.directory, "later.txt"), "later\n");
			await commitAll(clone.directory, "chore: later");
			const later = await runCommand(
				["git", "rev-parse", "HEAD"],
				clone.directory,
			);
			const gone = join(declared.directory, "deleted-clone");

			const failure = await failureOf(
				replaySourceRoot({
					recorded: gone,
					declared: declared.directory,
					sha: later.trim(),
				}),
			);

			expect(failure).toBeInstanceOf(ReplaySourceGoneError);
		});

		it("refuses when the case declares no target", async () => {
			const recorded = await testResources.createRepository();
			const gone = join(recorded.directory, "deleted-clone");

			const failure = await failureOf(
				replaySourceRoot({
					recorded: gone,
					declared: undefined,
					sha: recorded.sha,
				}),
			);

			expect(failure).toBeInstanceOf(ReplaySourceGoneError);
		});
	});
});
