import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { runCommand } from "./command";
import { StageValidationError } from "./contracts";
import {
	addWorktree,
	assertBuildCommitted,
	assertCommitSubjects,
	removeWorktree,
} from "./target";
import TemporaryWorktreeBuilder from "./target-worktree-test-builder";
import { TestResources, commitAll } from "./test-support";

const testResources = TestResources.forEachTest();
const returnsOnlyTheStagesCommitSubjectsOldestFirst =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		await Bun.write(
			join(source.directory, "first.ts"),
			"export const first = 1;\n",
		);
		await commitAll(source.directory, "add first change");
		await Bun.write(
			join(source.directory, "second.ts"),
			"export const second = 2;\n",
		);
		await commitAll(source.directory, "add second change");

		const build = await assertBuildCommitted({
			targetDir: source.directory,
			taskSha: source.sha,
		});

		expect(build.commitSubjects).toEqual([
			"add first change",
			"add second change",
		]);
	};
const acceptsABuildCommittedOnADetachedReplayWorktree =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		const { worktree } = await new TemporaryWorktreeBuilder().build(
			testResources,
		);
		await addWorktree(source.directory, source.sha, worktree);
		await Bun.write(join(worktree, "feature.ts"), "export const built = 1;\n");
		await commitAll(worktree, "feat: build in replay worktree");

		const build = await assertBuildCommitted(
			{ targetDir: worktree, taskSha: source.sha },
			null,
		);

		expect(build.diff).toContain("feature.ts");
		expect(
			assertBuildCommitted({ targetDir: worktree, taskSha: source.sha }),
		).rejects.toBeInstanceOf(StageValidationError);
		await removeWorktree(source.directory, worktree);
	};
const classifiesRewrittenTaskHistoryAsCandidateValidationFailure =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		await runCommand(
			["git", "switch", "--orphan", "rewritten"],
			source.directory,
		);
		await Bun.write(join(source.directory, "rewritten.txt"), "rewritten\n");
		await commitAll(source.directory, "feat: rewrite history");
		await runCommand(["git", "branch", "-M", "main"], source.directory);

		expect(
			assertBuildCommitted({
				targetDir: source.directory,
				taskSha: source.sha,
			}),
		).rejects.toBeInstanceOf(StageValidationError);
	};
describe(assertCommitSubjects.name, () => {
	const conventional = String.raw`^[a-z]+(?:\([^)]+\))?!?: .+`;

	it("accepts subjects matching the pipeline's convention", () => {
		expect(() => {
			assertCommitSubjects(
				["feat(audit): add worker", "fix: wire persistence"],
				conventional,
			);
		}).not.toThrow();
	});

	it("rejects subjects outside the pipeline's convention", () => {
		expect(() => {
			assertCommitSubjects(["Implement audit"], conventional);
		}).toThrow("do not match the pipeline's convention");
	});

	it("holds subjects to whatever convention the pipeline declares", () => {
		expect(() => {
			assertCommitSubjects(["add audit worker"], "^[a-z]");
		}).not.toThrow();
	});
});
describe(assertBuildCommitted.name, () => {
	it(
		"returns only the stage's commit subjects oldest first",
		returnsOnlyTheStagesCommitSubjectsOldestFirst,
	);

	it(
		"accepts a build committed on a detached replay worktree",
		acceptsABuildCommittedOnADetachedReplayWorktree,
	);

	it(
		"classifies rewritten task history as candidate validation failure",
		classifiesRewrittenTaskHistoryAsCandidateValidationFailure,
	);
});
