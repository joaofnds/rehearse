import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandError, runCommand } from "./command";
import { StageValidationError } from "./contracts";
import { failureOf } from "#cli/cli-test-support";
import {
	addWorktree,
	assertBuildCommitted,
	assertCommitSubjects,
	assertSourceReady,
	assertWorkflowBoardPrivate,
	assertWorkspaceCleanAt,
	capturePlanningAdvance,
	claimTarget,
	currentSha,
	readRunMarker,
	refExists,
	pruneWorktrees,
	removeWorktree,
} from "./target";
import { TestResources, commitAll } from "./test-support";

const testResources = TestResources.forEachTest();

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
	it("returns only the stage's commit subjects oldest first", async () => {
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

		const build = await assertBuildCommitted(source.directory, source.sha);

		expect(build.commitSubjects).toEqual([
			"add first change",
			"add second change",
		]);
	});

	it("accepts a build committed on a detached replay worktree", async () => {
		const source = await testResources.createRepository();
		const parent = await mkdtemp(join(tmpdir(), "rehearse-worktree-"));
		testResources.track(parent);
		const worktree = join(parent, "worktree");
		await addWorktree(source.directory, source.sha, worktree);
		await Bun.write(join(worktree, "feature.ts"), "export const built = 1;\n");
		await commitAll(worktree, "feat: build in replay worktree");

		const build = await assertBuildCommitted(worktree, source.sha, null);

		expect(build.diff).toContain("feature.ts");
		expect(assertBuildCommitted(worktree, source.sha)).rejects.toBeInstanceOf(
			StageValidationError,
		);
		await removeWorktree(source.directory, worktree);
	});

	it("classifies rewritten task history as candidate validation failure", async () => {
		const source = await testResources.createRepository();
		await runCommand(
			["git", "switch", "--orphan", "rewritten"],
			source.directory,
		);
		await Bun.write(join(source.directory, "rewritten.txt"), "rewritten\n");
		await commitAll(source.directory, "feat: rewrite history");
		await runCommand(["git", "branch", "-M", "main"], source.directory);

		expect(
			assertBuildCommitted(source.directory, source.sha),
		).rejects.toBeInstanceOf(StageValidationError);
	});
});

describe(currentSha.name, () => {
	it("reads the checkout's HEAD", async () => {
		const repository = await testResources.createRepository();

		expect(await currentSha(repository.directory)).toBe(repository.sha);
	});
});

describe(refExists.name, () => {
	it("finds a ref the repository holds", async () => {
		const source = await testResources.createRepository();
		await runCommand(
			["git", "update-ref", "refs/rehearse/run-1", source.sha],
			source.directory,
		);

		expect(await refExists(source.directory, "refs/rehearse/run-1")).toBe(true);
	});

	it("reports a ref the repository does not hold", async () => {
		const source = await testResources.createRepository();

		expect(await refExists(source.directory, "refs/rehearse/run-1")).toBe(
			false,
		);
	});

	/**
	 * A repository that has moved is not a run that retained nothing. Telling
	 * the two apart is what decides whether the caller goes looking for the
	 * repository or re-runs the benchmark, so the unreadable repository is
	 * raised rather than answered with false.
	 */
	it("raises a repository it cannot read rather than calling the ref missing", () => {
		const missing = join(tmpdir(), "rehearse-absent-repository");

		expect(refExists(missing, "refs/rehearse/run-1")).rejects.toThrow();
	});

	it("raises a directory that holds no repository", async () => {
		const plain = await mkdtemp(join(tmpdir(), "rehearse-plain-"));
		testResources.track(plain);

		expect(refExists(plain, "refs/rehearse/run-1")).rejects.toBeInstanceOf(
			CommandError,
		);
	});
});

describe(addWorktree.name, () => {
	it("gives a replay a detached checkout without touching the primary", async () => {
		const source = await testResources.createRepository();
		const parent = await mkdtemp(join(tmpdir(), "rehearse-worktree-"));
		testResources.track(parent);
		const worktree = join(parent, "worktree");

		await addWorktree(source.directory, source.sha, worktree);

		expect(await Bun.file(join(worktree, "base.txt")).text()).toBe("base\n");
		const worktreeBranch = await runCommand(
			["git", "branch", "--show-current"],
			worktree,
		);
		expect(worktreeBranch.trim()).toBe("");
		const primaryBranch = await runCommand(
			["git", "branch", "--show-current"],
			source.directory,
		);
		expect(primaryBranch.trim()).toBe("main");

		await removeWorktree(source.directory, worktree);

		expect(await Bun.file(join(worktree, "base.txt")).exists()).toBe(false);
	});

	it("removes a worktree that holds uncommitted replay state", async () => {
		const source = await testResources.createRepository();
		const parent = await mkdtemp(join(tmpdir(), "rehearse-worktree-"));
		testResources.track(parent);
		const worktree = join(parent, "worktree");
		await addWorktree(source.directory, source.sha, worktree);
		await Bun.write(join(worktree, "backlog", "task.md"), "workflow state\n");

		await removeWorktree(source.directory, worktree);

		expect(await Bun.file(join(worktree, "base.txt")).exists()).toBe(false);
	});
});

describe(pruneWorktrees.name, () => {
	it("forgets a worktree whose directory was deleted", async () => {
		const source = await testResources.createRepository();
		const parent = await mkdtemp(join(tmpdir(), "rehearse-worktree-"));
		testResources.track(parent);
		const worktree = join(parent, "worktree");
		await addWorktree(source.directory, source.sha, worktree);
		await rm(parent, { force: true, recursive: true });

		await pruneWorktrees(source.directory);

		const listed = await runCommand(
			["git", "worktree", "list", "--porcelain"],
			source.directory,
		);
		expect(listed).not.toContain("rehearse-worktree-");
	});
});

describe(capturePlanningAdvance.name, () => {
	it("captures commits a planning stage added on the baseline", async () => {
		const source = await testResources.createRepository();
		await Bun.write(join(source.directory, "GLOSSARY.md"), "audit log\n");
		await commitAll(source.directory, "add project glossary");
		const head = await runCommand(
			["git", "rev-parse", "HEAD"],
			source.directory,
		);

		const advance = await capturePlanningAdvance(source.directory, source.sha);

		expect(advance.resultSha).toBe(head.trim());
		expect(advance.changedPaths).toEqual(["GLOSSARY.md"]);
		expect(advance.diff).toContain("audit log");
		expect(advance.commitSubjects).toEqual(["add project glossary"]);
	});

	it("captures an empty advance when the stage committed nothing", async () => {
		const source = await testResources.createRepository();

		const advance = await capturePlanningAdvance(source.directory, source.sha);

		expect(advance).toEqual({
			resultSha: source.sha,
			diff: "",
			changedPaths: [],
		});
	});

	it("rejects a stage that rewrote the baseline history", async () => {
		const source = await testResources.createRepository();
		await runCommand(
			["git", "commit", "--amend", "--no-edit", "-m", "chore: rewritten"],
			source.directory,
		);

		expect(
			capturePlanningAdvance(source.directory, source.sha),
		).rejects.toThrow("rewrote or discarded task history");
	});

	it("names the paths a stage left uncommitted", async () => {
		const source = await testResources.createRepository();
		await Bun.write(join(source.directory, "stray.md"), "uncommitted\n");
		await Bun.write(join(source.directory, "GLOSSARY.md"), "audit log\n");

		expect(
			capturePlanningAdvance(source.directory, source.sha),
		).rejects.toThrow("Target worktree is dirty: ?? GLOSSARY.md, ?? stray.md");
	});

	it("names the branch a stage left the baseline for", async () => {
		const source = await testResources.createRepository();
		await runCommand(["git", "switch", "-c", "stray"], source.directory);

		expect(
			capturePlanningAdvance(source.directory, source.sha),
		).rejects.toThrow("Target is on branch stray, expected main");
	});
});

describe(assertWorkspaceCleanAt.name, () => {
	it("accepts a clean detached worktree when no branch is expected", async () => {
		const source = await testResources.createRepository();
		const parent = await mkdtemp(join(tmpdir(), "rehearse-worktree-"));
		testResources.track(parent);
		const worktree = join(parent, "worktree");
		await addWorktree(source.directory, source.sha, worktree);

		expect(
			assertWorkspaceCleanAt(worktree, source.sha, null),
		).resolves.toBeUndefined();
		expect(assertWorkspaceCleanAt(worktree, source.sha)).rejects.toBeInstanceOf(
			StageValidationError,
		);
	});

	it("rejects a workspace that left its detached checkout for a branch", async () => {
		const source = await testResources.createRepository();
		const parent = await mkdtemp(join(tmpdir(), "rehearse-worktree-"));
		testResources.track(parent);
		const worktree = join(parent, "worktree");
		await addWorktree(source.directory, source.sha, worktree);
		await runCommand(["git", "switch", "-c", "stray"], worktree);

		expect(
			assertWorkspaceCleanAt(worktree, source.sha, null),
		).rejects.toBeInstanceOf(StageValidationError);
	});

	it("names the branch a workspace left its detached checkout for", async () => {
		const source = await testResources.createRepository();
		const parent = await mkdtemp(join(tmpdir(), "rehearse-worktree-"));
		testResources.track(parent);
		const worktree = join(parent, "worktree");
		await addWorktree(source.directory, source.sha, worktree);
		await runCommand(["git", "switch", "-c", "stray"], worktree);

		expect(assertWorkspaceCleanAt(worktree, source.sha, null)).rejects.toThrow(
			"Target is on branch stray, expected a detached checkout",
		);
	});

	it("names the commit a workspace moved to", async () => {
		const source = await testResources.createRepository();
		const parent = await mkdtemp(join(tmpdir(), "rehearse-worktree-"));
		testResources.track(parent);
		const worktree = join(parent, "worktree");
		await addWorktree(source.directory, source.sha, worktree);
		await Bun.write(join(worktree, "extra.md"), "added\n");
		await commitAll(worktree, "chore: move ahead");
		const moved = await currentSha(worktree);

		expect(assertWorkspaceCleanAt(worktree, source.sha, null)).rejects.toThrow(
			`Target is at commit ${moved}, expected ${source.sha}`,
		);
	});

	it("names the paths a workspace left uncommitted", async () => {
		const source = await testResources.createRepository();
		const parent = await mkdtemp(join(tmpdir(), "rehearse-worktree-"));
		testResources.track(parent);
		const worktree = join(parent, "worktree");
		await addWorktree(source.directory, source.sha, worktree);
		await Bun.write(join(worktree, "stray.md"), "uncommitted\n");

		expect(assertWorkspaceCleanAt(worktree, source.sha, null)).rejects.toThrow(
			"Target worktree is dirty: ?? stray.md",
		);
	});
});

describe(assertSourceReady.name, () => {
	it("reports main's commit while another branch is checked out", async () => {
		const source = await testResources.createRepository();
		await runCommand(["git", "switch", "-c", "feature"], source.directory);
		await Bun.write(join(source.directory, "feature.txt"), "feature\n");
		await commitAll(source.directory, "feat: feature");

		const baseline = await assertSourceReady(source.directory);

		expect(baseline.sha).toBe(source.sha);
	});

	it("accepts a checkout with uncommitted and untracked changes", async () => {
		const source = await testResources.createRepository();
		await Bun.write(join(source.directory, "base.txt"), "edited\n");
		await Bun.write(join(source.directory, "notes.txt"), "scratch\n");

		const baseline = await assertSourceReady(source.directory);

		expect(baseline.sha).toBe(source.sha);
	});

	it("rejects a repository with no main branch", async () => {
		const source = await testResources.createRepository();
		await runCommand(
			["git", "branch", "-m", "main", "trunk"],
			source.directory,
		);

		expect(assertSourceReady(source.directory)).rejects.toThrow(
			"Target must have a main branch",
		);
	});

	it("rejects a repository subdirectory", async () => {
		const source = await testResources.createRepository();
		const subdirectory = join(source.directory, "nested");
		await mkdir(subdirectory);

		expect(assertSourceReady(subdirectory)).rejects.toThrow(
			"Target must be the repository root",
		);
	});
});
describe(assertWorkflowBoardPrivate.name, () => {
	it("refuses to treat tracked source as workflow state", async () => {
		const source = await testResources.createRepository();
		await mkdir(join(source.directory, "src"));
		await Bun.write(join(source.directory, "src", "app.ts"), "source\n");
		await Bun.write(
			join(source.directory, "backlog.config.yml"),
			'statuses: ["To Do", "Done"]\nbacklog_directory: "src"\n',
		);
		await runCommand(
			["git", "add", "src/app.ts", "backlog.config.yml"],
			source.directory,
		);
		await runCommand(
			["git", "commit", "-m", "chore: configure tracked board"],
			source.directory,
		);

		expect(assertWorkflowBoardPrivate(source.directory)).rejects.toThrow(
			"must not contain tracked files: src/app.ts",
		);
	});
});

const CLAIMING_RUN = "2026-10-08T00-00-00.000Z";

describe(claimTarget.name, () => {
	it("refuses a target an unrestored run left claimed", async () => {
		const source = await testResources.createRepository();
		const baseline = await assertSourceReady(source.directory);
		await claimTarget(baseline, CLAIMING_RUN);

		expect(claimTarget(baseline, CLAIMING_RUN)).rejects.toThrow(
			"previous benchmark run left this target unrestored",
		);
	});

	it("claims a linked-worktree target whose .git is a file", async () => {
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

		expect(claimTarget(baseline, CLAIMING_RUN)).rejects.toThrow(
			"previous benchmark run left this target unrestored",
		);
	});
});

describe(readRunMarker.name, () => {
	it("reads the pid a claim recorded for a still-claimed target", async () => {
		const source = await testResources.createRepository();
		const baseline = await assertSourceReady(source.directory);
		await claimTarget(baseline, CLAIMING_RUN);

		const marker = await readRunMarker(baseline.root);

		expect(marker).toMatchObject({ sha: baseline.sha, pid: process.pid });
	});

	it("reads the run a claim names", async () => {
		const source = await testResources.createRepository();
		const baseline = await assertSourceReady(source.directory);
		await claimTarget(baseline, CLAIMING_RUN);

		const marker = await readRunMarker(baseline.root);

		expect(marker?.run).toBe(CLAIMING_RUN);
	});

	it("reads a claim written by a checkout from before claims named their run", async () => {
		const source = await testResources.createRepository();
		const baseline = await assertSourceReady(source.directory);
		await Bun.write(
			join(baseline.root, ".git", "benchmark-run.json"),
			JSON.stringify({
				sha: baseline.sha,
				pid: 4242,
				startedAt: "2026-09-01T00:00:00.000Z",
			}),
		);

		const marker = await readRunMarker(baseline.root);

		expect(marker).toEqual({
			sha: baseline.sha,
			pid: 4242,
			startedAt: "2026-09-01T00:00:00.000Z",
		});
	});

	it("reports no marker for a target nothing has claimed", async () => {
		const source = await testResources.createRepository();
		const baseline = await assertSourceReady(source.directory);

		expect(await readRunMarker(baseline.root)).toBeUndefined();
	});

	it("reports no marker for a checkout that is gone, since only the run's end removes it", async () => {
		const parent = await mkdtemp(join(tmpdir(), "rehearse-checkout-"));
		testResources.track(parent);

		expect(await readRunMarker(join(parent, "removed"))).toBeUndefined();
	});

	describe("when the directory is no checkout", () => {
		it("raises it rather than reporting no marker", async () => {
			const plain = await mkdtemp(join(tmpdir(), "rehearse-plain-"));
			testResources.track(plain);

			const failure = await failureOf(readRunMarker(plain));

			expect(failure).toBeInstanceOf(CommandError);
		});
	});
});
