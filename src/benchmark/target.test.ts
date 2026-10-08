import { describe, expect, it } from "bun:test";
import { chmod, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedTaskBoard } from "./backlog";
import { CommandError, runCommand } from "./command";
import { StageValidationError } from "./contracts";
import {
	addWorktree,
	assertBuildCommitted,
	assertCommitSubjects,
	assertSourceReady,
	assertWorkspaceCleanAt,
	capturePlanningAdvance,
	captureWorkflowBackup,
	claimTarget,
	currentSha,
	readRunMarker,
	refExists,
	pruneWorktrees,
	removeWorktree,
	restoreTarget,
	teardownTarget,
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
	it("rejects a clean repository off main", async () => {
		const source = await testResources.createRepository();
		await runCommand(["git", "switch", "-c", "feature"], source.directory);

		expect(assertSourceReady(source.directory)).rejects.toThrow(
			"Target must be on main",
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

describe(restoreTarget.name, () => {
	it("restores main after generated commits and files", async () => {
		const source = await testResources.createRepository();
		const baseline = await assertSourceReady(source.directory);
		await Bun.write(
			join(source.directory, "generated.ts"),
			"export const value = 1;\n",
		);
		await commitAll(source.directory, "feat: generate change");
		await Bun.write(join(source.directory, "unfinished.ts"), "unfinished\n");

		await restoreTarget(baseline);

		expect(
			await runCommand(["git", "rev-parse", "HEAD"], source.directory),
		).toBe(`${source.sha}\n`);
		expect(
			await runCommand(["git", "status", "--porcelain"], source.directory),
		).toBe("");
		expect(
			await Bun.file(join(source.directory, "generated.ts")).exists(),
		).toBe(false);
		expect(
			await Bun.file(join(source.directory, "unfinished.ts")).exists(),
		).toBe(false);
	});

	it("returns the target to main from a stage branch", async () => {
		const source = await testResources.createRepository();
		const baseline = await assertSourceReady(source.directory);
		await runCommand(["git", "switch", "-c", "agent-work"], source.directory);
		await Bun.write(join(source.directory, "stray.ts"), "export {};\n");
		await commitAll(source.directory, "feat: stray branch work");

		await restoreTarget(baseline);

		const restoredBranch = await runCommand(
			["git", "branch", "--show-current"],
			source.directory,
		);
		expect(restoredBranch.trim()).toBe("main");
		const restoredSha = await runCommand(
			["git", "rev-parse", "HEAD"],
			source.directory,
		);
		expect(restoredSha.trim()).toBe(source.sha);
	});

	it("reproduces the captured workflow state", async () => {
		const source = await testResources.createRepository();
		const backlogDirectory = join(source.directory, "backlog");
		const original = new Uint8Array([0, 255, 10]);
		await mkdir(join(backlogDirectory, "empty"), { recursive: true });
		await Bun.write(join(backlogDirectory, "original.bin"), original);
		const baseline = await assertSourceReady(source.directory);
		const backup = await captureWorkflowBackup(source.directory);
		testResources.track(backup.directory);
		await Bun.write(join(backlogDirectory, "original.bin"), "changed\n");
		await Bun.write(join(backlogDirectory, "generated.md"), "generated\n");
		await Bun.write(
			join(source.directory, ".boris", "CONTEXT.md"),
			"created\n",
		);

		await restoreTarget(baseline, backup);

		const restored = await Bun.file(
			join(backlogDirectory, "original.bin"),
		).bytes();
		const emptyDirectory = await stat(join(backlogDirectory, "empty"));
		expect(restored).toEqual(original);
		expect(emptyDirectory.isDirectory()).toBe(true);
		expect(
			await Bun.file(join(backlogDirectory, "generated.md")).exists(),
		).toBe(false);
		expect(stat(join(source.directory, ".boris"))).rejects.toThrow();
	});

	it("removes a seeded task when restoring an existing .backlog board", async () => {
		const source = await testResources.createRepository();
		const configPath = join(source.directory, ".backlog", "config.yml");
		await runCommand(
			[
				"backlog",
				"init",
				"Existing",
				"--defaults",
				"--integration-mode",
				"cli",
				"--agent-instructions",
				"none",
				"--backlog-dir",
				".backlog",
				"--config-location",
				"folder",
				"--no-git",
			],
			source.directory,
		);
		const original = await Bun.file(configPath).text();
		await runCommand(
			["git", "add", "-f", ".backlog/config.yml"],
			source.directory,
		);
		await runCommand(
			["git", "commit", "-m", "chore: configure backlog"],
			source.directory,
		);
		const baseline = await assertSourceReady(source.directory);
		const backup = await captureWorkflowBackup(source.directory);
		testResources.track(backup.directory);
		await seedTaskBoard(
			source.directory,
			"# Review fixture\n\nExercise restoration.\n",
			["To Do", "In Progress", "Done"],
		);

		await restoreTarget(baseline, backup);

		expect(await Bun.file(configPath).text()).toBe(original);
		expect(
			await Bun.file(
				join(
					source.directory,
					".backlog",
					"tasks",
					"work-1 - Review-fixture.md",
				),
			).exists(),
		).toBe(false);
	});

	it("restores an ignored custom board and root configuration exactly", async () => {
		const source = await testResources.createRepository();
		const configPath = join(source.directory, "backlog.config.yml");
		const boardDirectory = join(source.directory, "workflow-board");
		const originalConfig = [
			'project_name: "Existing"',
			'default_status: "To Do"',
			'statuses: ["To Do"]',
			"task_prefix: work",
			'backlog_directory: "workflow-board"',
			"",
		].join("\n");
		await Bun.write(
			join(source.directory, ".git", "info", "exclude"),
			"/backlog.config.yml\n/workflow-board/\n",
		);
		await mkdir(boardDirectory);
		await Bun.write(configPath, originalConfig);
		await Bun.write(join(boardDirectory, "original.md"), "original\n");
		const baseline = await assertSourceReady(source.directory);
		const backup = await captureWorkflowBackup(source.directory);
		testResources.track(backup.directory);
		await seedTaskBoard(
			source.directory,
			"# Review fixture\n\nExercise restoration.\n",
			["To Do", "Done"],
		);

		await restoreTarget(baseline, backup);

		expect(await Bun.file(configPath).text()).toBe(originalConfig);
		expect(await Bun.file(join(boardDirectory, "original.md")).text()).toBe(
			"original\n",
		);
		expect(
			await Bun.file(
				join(boardDirectory, "tasks", "work-1 - Review-fixture.md"),
			).exists(),
		).toBe(false);
	});

	it("does not grant candidate configuration ownership of tracked source", async () => {
		const source = await testResources.createRepository();
		await mkdir(join(source.directory, "src"));
		await Bun.write(join(source.directory, "src", "app.ts"), "source\n");
		await commitAll(source.directory, "feat: add source");
		const baseline = await assertSourceReady(source.directory);
		const backup = await captureWorkflowBackup(source.directory);
		testResources.track(backup.directory);
		await Bun.write(
			join(source.directory, "backlog.config.yml"),
			'statuses: ["To Do", "Done"]\nbacklog_directory: "src"\n',
		);

		await restoreTarget(baseline, backup);

		expect(await Bun.file(join(source.directory, "src", "app.ts")).text()).toBe(
			"source\n",
		);
		expect(
			await runCommand(
				["git", "status", "--porcelain", "--untracked-files=all"],
				source.directory,
			),
		).toBe("");
	});

	it("restores a target whose candidate configuration is malformed", async () => {
		const source = await testResources.createRepository();
		const baseline = await assertSourceReady(source.directory);
		const backup = await captureWorkflowBackup(source.directory);
		testResources.track(backup.directory);
		await Bun.write(
			join(source.directory, "backlog.config.yml"),
			"statuses: [unterminated\n",
		);

		await restoreTarget(baseline, backup);

		expect(
			await Bun.file(join(source.directory, "backlog.config.yml")).exists(),
		).toBe(false);
		expect(
			await runCommand(
				["git", "status", "--porcelain", "--untracked-files=all"],
				source.directory,
			),
		).toBe("");
	});
});

describe(captureWorkflowBackup.name, () => {
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

		expect(captureWorkflowBackup(source.directory)).rejects.toThrow(
			"must not contain tracked files: src/app.ts",
		);
	});

	it("rejects a workflow path discovery failure, leaving no backup directory", async () => {
		const source = await testResources.createRepository();
		await mkdir(join(source.directory, "backlog"));
		await chmod(source.directory, 0o000);
		const entriesBefore = await readdir(tmpdir());
		const backupsBefore = new Set(
			entriesBefore.filter((entry) =>
				entry.startsWith("rehearse-workflow-backup-"),
			),
		);

		try {
			expect(captureWorkflowBackup(source.directory)).rejects.toThrow(
				/permission denied|EACCES/iu,
			);
		} finally {
			await chmod(source.directory, 0o755);
		}

		const entriesAfter = await readdir(tmpdir());
		const newBackups = entriesAfter
			.filter((entry) => entry.startsWith("rehearse-workflow-backup-"))
			.filter((entry) => !backupsBefore.has(entry));
		expect(newBackups).toEqual([]);
	});

	it("rejects a captured workflow tree missing from the backup", async () => {
		const source = await testResources.createRepository();
		await Bun.write(
			join(source.directory, "backlog", "original.md"),
			"original\n",
		);
		const baseline = await assertSourceReady(source.directory);
		const backup = await captureWorkflowBackup(source.directory);
		testResources.track(backup.directory);
		await rm(join(backup.directory, "backlog"), {
			force: true,
			recursive: true,
		});

		expect(restoreTarget(baseline, backup)).rejects.toThrow();
	});

	it("ignores a workflow tree planted in the backup after capture", async () => {
		const source = await testResources.createRepository();
		const baseline = await assertSourceReady(source.directory);
		const backup = await captureWorkflowBackup(source.directory);
		testResources.track(backup.directory);
		await Bun.write(
			join(backup.directory, ".boris", "planted.md"),
			"planted\n",
		);

		await restoreTarget(baseline, backup);

		expect(stat(join(source.directory, ".boris"))).rejects.toThrow();
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

	it("releases the claim after a verified restore", async () => {
		const source = await testResources.createRepository();
		const baseline = await assertSourceReady(source.directory);
		await claimTarget(baseline, CLAIMING_RUN);

		await restoreTarget(baseline);

		expect(claimTarget(baseline, CLAIMING_RUN)).resolves.toBeUndefined();
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
		await restoreTarget(baseline);
		expect(claimTarget(baseline, CLAIMING_RUN)).resolves.toBeUndefined();
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

	it("reports no marker for a target nothing has claimed", async () => {
		const source = await testResources.createRepository();
		const baseline = await assertSourceReady(source.directory);

		expect(await readRunMarker(baseline.root)).toBeUndefined();
	});

	it("reports no marker once a claim is restored", async () => {
		const source = await testResources.createRepository();
		const baseline = await assertSourceReady(source.directory);
		await claimTarget(baseline, CLAIMING_RUN);
		await restoreTarget(baseline);

		expect(await readRunMarker(baseline.root)).toBeUndefined();
	});
});

describe(teardownTarget.name, () => {
	it("discards the workflow backup after a verified restore", async () => {
		const source = await testResources.createRepository();
		const baseline = await assertSourceReady(source.directory);
		const backup = await captureWorkflowBackup(source.directory);
		testResources.track(backup.directory);
		await Bun.write(join(source.directory, "candidate.ts"), "export {};\n");
		await commitAll(source.directory, "feat: candidate");

		await teardownTarget(baseline, backup, () => undefined);

		const finalSha = await runCommand(
			["git", "rev-parse", "HEAD"],
			source.directory,
		);
		expect(finalSha.trim()).toBe(source.sha);
		expect(stat(backup.directory)).rejects.toThrow();
	});

	it("announces the restored commit through the caller's writer", async () => {
		const source = await testResources.createRepository();
		const baseline = await assertSourceReady(source.directory);
		const backup = await captureWorkflowBackup(source.directory);
		testResources.track(backup.directory);
		const written: string[] = [];

		await teardownTarget(baseline, backup, (message) => {
			written.push(message);
		});

		expect(written).toEqual([`Target restored to ${source.sha}.`]);
	});

	it("keeps the workflow backup when the restore fails", async () => {
		const source = await testResources.createRepository();
		const backup = await captureWorkflowBackup(source.directory);
		testResources.track(backup.directory);
		const broken = {
			root: source.directory,
			sha: "0000000000000000000000000000000000000000",
		};

		expect(teardownTarget(broken, backup, () => undefined)).rejects.toThrow();
		expect(stat(backup.directory)).resolves.toBeDefined();
	});
});
