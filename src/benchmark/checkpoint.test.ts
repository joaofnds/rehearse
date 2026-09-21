import { describe, expect, it } from "bun:test";
import {
	chmod,
	mkdir,
	mkdtemp,
	readdir,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	CheckpointRecord,
	HashedFile,
	StageCorpus,
	StalenessRequest,
} from "./checkpoint";
import {
	captureStageCorpus,
	corpusDifferences,
	corpusLayoutRoots,
	deriveStaleness,
	hashDirectory,
	hashedCorpus,
	hashWorkflowState,
	initialCheckpointInputs,
	installStageCorpusSnapshot,
	lineageKey,
	materializeCheckpoint,
	recordCheckpoint,
	refusedCorpus,
	rootLineage,
	snapshotStageCorpus,
	stageCorpusRoots,
} from "./checkpoint";
import type { CorpusRoot } from "./corpus-file";
import { projectSlug } from "./session-capture";
import { SymlinkedEntryError } from "./file-presence";
import { failureOf } from "#cli/cli-test-support";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

// @ts-expect-error current settings cannot be both available and unavailable
const contradictorySettingsRequest: StalenessRequest = {
	model: "sonnet",
	settingsFile: { path: "stage-settings.json", sha256: "a".repeat(64) },
	settingsFileRefusal: "stage settings are unavailable",
};
void contradictorySettingsRequest;

function corpusSources(roots: readonly string[]): readonly CorpusRoot[] {
	return roots.map((root) => ({ kind: "directory", root }));
}

describe(lineageKey.name, () => {
	const base = {
		upstream: "root-key",
		corpusFiles: [
			{ path: "CLAUDE.md", sha256: "aa11" },
			{ path: ".claude/skills/discuss/SKILL.md", sha256: "bb22" },
		],
		model: "sonnet",
		effort: "high",
	} as const;

	it("returns the same key for the same inputs", () => {
		expect(lineageKey({ ...base })).toBe(lineageKey({ ...base }));
	});

	it("ignores the order corpus files are listed in", () => {
		expect(
			lineageKey({ ...base, corpusFiles: base.corpusFiles.toReversed() }),
		).toBe(lineageKey(base));
	});

	it("changes when any lineage input changes", () => {
		const variants = [
			lineageKey({ ...base, upstream: "other-upstream" }),
			lineageKey({
				...base,
				corpusFiles: [
					base.corpusFiles[0],
					{ ...base.corpusFiles[1], sha256: "cc33" },
				],
			}),
			lineageKey({
				...base,
				corpusFiles: [
					...base.corpusFiles,
					{ path: "extra.md", sha256: "dd44" },
				],
			}),
			lineageKey({ ...base, model: "opus" }),
			lineageKey({ ...base, effort: "low" }),
			lineageKey({ ...base, effort: undefined }),
			lineageKey({
				...base,
				settingsFile: { path: "stage-settings.json", sha256: "ee55" },
			}),
		];

		expect(new Set([lineageKey(base), ...variants]).size).toBe(
			variants.length + 1,
		);
	});
});

describe(captureStageCorpus.name, () => {
	it("refuses a layout root outside the corpus without naming its descendants", async () => {
		const parent = await mkdtemp(join(tmpdir(), "rehearse-layout-root-"));
		testResources.track(parent);
		const root = join(parent, "corpus");
		const foreign = join(parent, "private-project");
		await mkdir(join(root, "skills", "build"), { recursive: true });
		await mkdir(foreign);
		await writeFile(join(root, "skills", "build", "SKILL.md"), "build");
		await writeFile(join(foreign, "secret.md"), "foreign contents");
		await symlink(foreign, join(root, "agents"));

		const failure = await failureOf(
			captureStageCorpus("build", "instructions", corpusSources([root])),
		);

		expect(failure).toBeInstanceOf(SymlinkedEntryError);
		expect(failure.message).toContain("agents");
		expect(failure.message).not.toContain("private-project");
		expect(failure.message).not.toContain("secret.md");
		expect(failure.message).not.toContain("foreign contents");
	});

	async function corpusRoots(): Promise<[string, string]> {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-corpus-"));
		testResources.track(directory);
		const roots: [string, string] = [
			join(directory, "target"),
			join(directory, "home"),
		];
		await Promise.all(roots.map((root) => mkdir(root, { recursive: true })));

		return roots;
	}

	async function installSkill(
		root: string,
		skill: string,
		body: string,
	): Promise<void> {
		const directory = join(root, "skills", skill, "references");
		await mkdir(directory, { recursive: true });
		await Bun.write(join(root, "skills", skill, "SKILL.md"), body);
		await Bun.write(join(directory, "notes.md"), `${body} notes`);
	}

	async function installAgent(
		root: string,
		agent: string,
		body: string,
	): Promise<void> {
		await mkdir(join(root, "agents"), { recursive: true });
		await Bun.write(join(root, "agents", `${agent}.md`), body);
	}

	async function installRule(
		root: string,
		rule: string,
		body: string,
	): Promise<void> {
		await mkdir(join(root, "rulebook"), { recursive: true });
		await Bun.write(join(root, "rulebook", `${rule}.md`), body);
	}

	async function installOutputStyle(
		root: string,
		style: string,
		body: string,
	): Promise<void> {
		await mkdir(join(root, "output-styles"), { recursive: true });
		await Bun.write(join(root, "output-styles", `${style}.md`), body);
	}

	it("hashes the installed instructions and every skill file", async () => {
		const roots = await corpusRoots();
		await installSkill(roots[1], "discuss", "discuss skill");

		const corpus = await captureStageCorpus(
			"discuss",
			"instructions",
			corpusSources(roots),
		);

		expect(corpus.map(({ path }) => path)).toEqual([
			"CLAUDE.md",
			"skills/discuss/SKILL.md",
			"skills/discuss/references/notes.md",
		]);
		expect(new Set(corpus.map(({ sha256 }) => sha256)).size).toBe(3);
	});

	it("records the same corpus wherever the same skill files live", async () => {
		const [targetRoot, homeRoot] = await corpusRoots();
		for (const root of [targetRoot, homeRoot]) {
			await installSkill(root, "doctrine", "doctrine skill");
			await installSkill(root, "discuss", "discuss skill");
		}

		const fromTarget = await captureStageCorpus(
			"discuss",
			"instructions",
			corpusSources([targetRoot]),
		);
		const fromHome = await captureStageCorpus(
			"discuss",
			"instructions",
			corpusSources([homeRoot]),
		);

		expect(fromTarget).toEqual(fromHome);
	});

	it("installs frozen skill bytes after their source changes", async () => {
		const roots = await corpusRoots();
		await installSkill(roots[1], "doctrine", "doctrine skill");
		await installSkill(roots[1], "discuss", "discuss skill");
		const parent = await mkdtemp(join(tmpdir(), "rehearse-corpus-snapshot-"));
		testResources.track(parent);
		const snapshotDirectory = join(parent, "snapshot");
		const firstWorktree = join(parent, "first");
		const secondWorktree = join(parent, "second");
		await Promise.all([
			mkdir(firstWorktree, { recursive: true }),
			mkdir(secondWorktree, { recursive: true }),
		]);
		const frozen = await snapshotStageCorpus(
			"discuss",
			"instructions",
			corpusSources(roots),
			snapshotDirectory,
		);

		await Bun.write(
			join(roots[1], "skills", "discuss", "SKILL.md"),
			"changed skill",
		);
		await Promise.all([
			installStageCorpusSnapshot(snapshotDirectory, firstWorktree),
			installStageCorpusSnapshot(snapshotDirectory, secondWorktree),
		]);

		const first = await captureStageCorpus(
			"discuss",
			"instructions",
			corpusSources([join(firstWorktree, ".claude")]),
		);
		const second = await captureStageCorpus(
			"discuss",
			"instructions",
			corpusSources([join(secondWorktree, ".claude")]),
		);
		expect(first).toEqual(frozen);
		expect(second).toEqual(frozen);
		expect(
			await Bun.file(
				join(firstWorktree, ".claude", "skills", "discuss", "SKILL.md"),
			).text(),
		).toBe("discuss skill");
	});

	it("installs the frozen instructions as CLAUDE.md under the target's .claude directory", async () => {
		const roots = await corpusRoots();
		await installSkill(roots[1], "doctrine", "doctrine skill");
		await installSkill(roots[1], "discuss", "discuss skill");
		const parent = await mkdtemp(join(tmpdir(), "rehearse-corpus-snapshot-"));
		testResources.track(parent);
		const snapshotDirectory = join(parent, "snapshot");
		const worktree = join(parent, "worktree");
		await mkdir(worktree, { recursive: true });
		await snapshotStageCorpus(
			"discuss",
			"frozen instructions",
			corpusSources(roots),
			snapshotDirectory,
		);

		await installStageCorpusSnapshot(snapshotDirectory, worktree);

		expect(await Bun.file(join(worktree, ".claude", "CLAUDE.md")).text()).toBe(
			"frozen instructions",
		);
	});

	it("refuses to install a snapshot entry that resolves outside the snapshot directory", async () => {
		const parent = await mkdtemp(join(tmpdir(), "rehearse-corpus-snapshot-"));
		testResources.track(parent);
		const outside = join(parent, "outside");
		await mkdir(outside, { recursive: true });
		await Bun.write(join(outside, "secret.md"), "SECRET BYTES\n");
		const snapshotDirectory = join(parent, "snapshot");
		for (const kind of ["skills", "agents", "output-styles", "rulebook"]) {
			await mkdir(join(snapshotDirectory, kind), { recursive: true });
		}
		await Bun.write(join(snapshotDirectory, "CLAUDE.md"), "instructions\n");
		await symlink(
			join(outside, "secret.md"),
			join(snapshotDirectory, "agents", "leak.md"),
		);
		const worktree = join(parent, "worktree");
		await mkdir(worktree, { recursive: true });

		const failure = await failureOf(
			installStageCorpusSnapshot(snapshotDirectory, worktree),
		);

		expect(failure).toBeInstanceOf(SymlinkedEntryError);
		expect(failure.message).toContain("agents/leak.md");
		expect(failure.message).not.toContain("SECRET BYTES");
	});

	it("removes a prior stage's agents and output styles the next stage's snapshot does not carry", async () => {
		const roots = await corpusRoots();
		await installSkill(roots[1], "doctrine", "doctrine skill");
		await installSkill(roots[1], "discuss", "discuss skill");
		await installSkill(roots[1], "build", "build skill");
		await installAgent(roots[1], "reviewer", "reviewer agent");
		const parent = await mkdtemp(join(tmpdir(), "rehearse-corpus-snapshot-"));
		testResources.track(parent);
		const worktree = join(parent, "worktree");
		await mkdir(worktree, { recursive: true });

		const firstSnapshot = join(parent, "first-snapshot");
		await snapshotStageCorpus(
			"discuss",
			"instructions",
			corpusSources(roots),
			firstSnapshot,
		);
		await installStageCorpusSnapshot(firstSnapshot, worktree);
		expect(
			await stat(join(worktree, ".claude", "agents", "reviewer.md")),
		).toBeDefined();

		await rm(join(roots[1], "agents"), { recursive: true });
		const secondSnapshot = join(parent, "second-snapshot");
		await snapshotStageCorpus(
			"build",
			"instructions",
			corpusSources(roots),
			secondSnapshot,
		);
		await installStageCorpusSnapshot(secondSnapshot, worktree);

		expect(
			stat(join(worktree, ".claude", "agents", "reviewer.md")),
		).rejects.toThrow();
	});

	it("prefers the first root that has the skill", async () => {
		const roots = await corpusRoots();
		await installSkill(roots[1], "doctrine", "doctrine skill");
		await installSkill(roots[0], "discuss", "target copy");
		await installSkill(roots[1], "discuss", "home copy");

		const corpus = await captureStageCorpus(
			"discuss",
			"instructions",
			corpusSources(roots),
		);
		const homeOnly = await captureStageCorpus(
			"discuss",
			"instructions",
			corpusSources([roots[1]]),
		);

		expect(corpus).not.toEqual(homeOnly);
	});

	it("fails naming the skill and the searched roots when none has it", async () => {
		const roots = await corpusRoots();

		expect(
			captureStageCorpus("discuss", "instructions", corpusSources(roots)),
		).rejects.toThrow(/discuss.*not installed/u);
	});

	it("hashes every agent and output style file, project root first", async () => {
		const roots = await corpusRoots();
		await installSkill(roots[1], "discuss", "discuss skill");
		await installAgent(roots[1], "reviewer", "reviewer agent");
		await installOutputStyle(roots[1], "brief", "brief style");

		const corpus = await captureStageCorpus(
			"discuss",
			"instructions",
			corpusSources(roots),
		);

		expect(corpus.map(({ path }) => path)).toEqual([
			"CLAUDE.md",
			"agents/reviewer.md",
			"output-styles/brief.md",
			"skills/discuss/SKILL.md",
			"skills/discuss/references/notes.md",
		]);
	});

	it("prefers the project root's whole agents directory over the user's", async () => {
		const roots = await corpusRoots();
		await installSkill(roots[1], "discuss", "discuss skill");
		await installAgent(roots[0], "reviewer", "project reviewer");
		await installAgent(roots[1], "reviewer", "user reviewer");
		await installAgent(roots[1], "other", "user-only agent");

		const corpus = await captureStageCorpus(
			"discuss",
			"instructions",
			corpusSources(roots),
		);

		const agentFiles = corpus.filter(({ path }) => path.startsWith("agents/"));
		expect(agentFiles.map(({ path }) => path)).toEqual(["agents/reviewer.md"]);
	});

	it("hashes every rule file, so an edit to one changes the corpus", async () => {
		const roots = await corpusRoots();
		await installSkill(roots[1], "discuss", "discuss skill");
		await installRule(roots[1], "doctrine", "the doctrine");
		const before = await captureStageCorpus(
			"discuss",
			"instructions",
			corpusSources(roots),
		);

		await installRule(roots[1], "doctrine", "the doctrine, revised");
		const after = await captureStageCorpus(
			"discuss",
			"instructions",
			corpusSources(roots),
		);

		expect(before.some(({ path }) => path === "rulebook/doctrine.md")).toBe(
			true,
		);
		expect(after).not.toEqual(before);
	});

	it("captures no agents or output styles when neither root has them", async () => {
		const roots = await corpusRoots();
		await installSkill(roots[1], "discuss", "discuss skill");

		const corpus = await captureStageCorpus(
			"discuss",
			"instructions",
			corpusSources(roots),
		);

		expect(corpus.some(({ path }) => path.startsWith("agents/"))).toBe(false);
		expect(corpus.some(({ path }) => path.startsWith("output-styles/"))).toBe(
			false,
		);
	});
});

describe(recordCheckpoint.name, () => {
	const checkpointInputs = {
		stage: "discuss",
		targetSha: "task-sha",
		upstream: "root-key",
		model: "sonnet",
		effort: "high",
		corpusFiles: [{ path: "CLAUDE.md", sha256: "aa11".repeat(16) }],
		artifacts: [
			{ path: "backlog/docs/DOC-1 - spec.md", sha256: "bb22".repeat(16) },
		],
	} as const;

	interface CheckpointFixture {
		readonly targetDir: string;
		readonly checkpointDir: string;
		readonly destination: string;
	}

	async function checkpointFixture(): Promise<CheckpointFixture> {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-checkpoint-"));
		testResources.track(directory);
		const targetDir = join(directory, "target");
		await mkdir(join(targetDir, "backlog", "docs"), { recursive: true });
		await mkdir(join(targetDir, ".boris"), { recursive: true });
		await Bun.write(join(targetDir, "backlog", "config.yml"), "statuses: []\n");
		await Bun.write(
			join(targetDir, "backlog", "docs", "DOC-1 - spec.md"),
			"the spec\n",
		);
		await Bun.write(join(targetDir, ".boris", "CONTEXT.md"), "context\n");
		await mkdir(join(targetDir, "backlog", "drafts"), { recursive: true });
		await Bun.write(join(targetDir, "ignored.ts"), "not workflow state\n");

		return {
			targetDir,
			checkpointDir: join(directory, "checkpoint"),
			destination: join(directory, "materialized"),
		};
	}

	it("preserves the stage's raw session transcript beside the checkpoint", async () => {
		const { targetDir, checkpointDir } = await checkpointFixture();
		const projectsDirectory = await mkdtemp(
			join(tmpdir(), "rehearse-projects-"),
		);
		testResources.track(projectsDirectory);
		const sessionId = "0f9a2c1e-1111-4222-8333-444455556666";
		const slug = join(projectsDirectory, projectSlug(targetDir));
		await mkdir(slug, { recursive: true });
		const raw = `{"type":"user"}\n{"type":"assistant"}\n`;
		await Bun.write(join(slug, `${sessionId}.jsonl`), raw);

		const record = await recordCheckpoint(targetDir, checkpointDir, {
			...checkpointInputs,
			transcript: { sessionId, projectsDirectory },
		});

		expect(record.transcript).toEqual({
			file: "transcript.jsonl",
			sessionId,
			status: "AVAILABLE",
		});
		// The bytes, not a parse of them: a later context manifest must be able
		// to observe what the stage actually loaded.
		expect(await Bun.file(join(checkpointDir, "transcript.jsonl")).text()).toBe(
			raw,
		);
	});

	it("records an absent stage transcript as unavailable", async () => {
		const { targetDir, checkpointDir } = await checkpointFixture();
		const projectsDirectory = await mkdtemp(
			join(tmpdir(), "rehearse-projects-"),
		);
		testResources.track(projectsDirectory);
		const sessionId = "0f9a2c1e-1111-4222-8333-444455556666";

		const record = await recordCheckpoint(targetDir, checkpointDir, {
			...checkpointInputs,
			transcript: { sessionId, projectsDirectory },
		});

		// Unavailable must be said outright. Silence here would let a reader
		// take the stage's parsed exchanges for the raw transcript.
		expect(record.transcript).toEqual({ sessionId, status: "UNAVAILABLE" });
		expect(
			await Bun.file(join(checkpointDir, "transcript.jsonl")).exists(),
		).toBe(false);
	});

	it("omits the transcript field when no session is supplied", async () => {
		const { targetDir, checkpointDir } = await checkpointFixture();

		const record = await recordCheckpoint(
			targetDir,
			checkpointDir,
			checkpointInputs,
		);

		// The thirteen checkpoints already on disk carry no such field, and
		// they must keep parsing.
		expect(record.transcript).toBeUndefined();
	});

	it("materializes a recorded checkpoint byte-for-byte", async () => {
		const { targetDir, checkpointDir, destination } = await checkpointFixture();

		const record = await recordCheckpoint(
			targetDir,
			checkpointDir,
			checkpointInputs,
		);
		await mkdir(destination, { recursive: true });
		const materialized = await materializeCheckpoint(
			checkpointDir,
			destination,
		);

		expect(materialized).toEqual(record);
		expect(record.lineage).toBe(
			lineageKey({
				upstream: "root-key",
				corpusFiles: checkpointInputs.corpusFiles,
				model: "sonnet",
				effort: "high",
			}),
		);
		expect(record.workflowState.map(({ path }) => path).toSorted()).toEqual([
			".boris/CONTEXT.md",
			"backlog/config.yml",
			"backlog/docs/DOC-1 - spec.md",
		]);
		for (const { path } of record.workflowState) {
			expect(await Bun.file(join(destination, path)).bytes()).toEqual(
				await Bun.file(join(targetDir, path)).bytes(),
			);
		}
		expect(await Bun.file(join(destination, "ignored.ts")).exists()).toBe(
			false,
		);
		const draftsStats = await stat(join(destination, "backlog", "drafts"));
		expect(draftsStats.isDirectory()).toBe(true);
	});

	it("materializes a root configuration and its custom board", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-checkpoint-"));
		testResources.track(directory);
		const targetDir = join(directory, "target");
		const checkpointDir = join(directory, "checkpoint");
		const destination = join(directory, "materialized");
		const config = [
			'project_name: "Existing"',
			'statuses: ["To Do", "Done"]',
			'backlog_directory: "workflow-board"',
			"",
		].join("\n");
		await mkdir(join(targetDir, "workflow-board", "tasks"), {
			recursive: true,
		});
		await Bun.write(join(targetDir, "backlog.config.yml"), config);
		await Bun.write(
			join(targetDir, "workflow-board", "tasks", "work-1.md"),
			"the task\n",
		);

		const record = await recordCheckpoint(
			targetDir,
			checkpointDir,
			checkpointInputs,
		);
		await mkdir(destination, { recursive: true });
		await materializeCheckpoint(checkpointDir, destination);

		expect(record.workflowState.map(({ path }) => path).toSorted()).toEqual([
			"backlog.config.yml",
			"workflow-board/tasks/work-1.md",
		]);
		expect(await Bun.file(join(destination, "backlog.config.yml")).text()).toBe(
			config,
		);
		expect(
			await Bun.file(
				join(destination, "workflow-board", "tasks", "work-1.md"),
			).text(),
		).toBe("the task\n");
	});

	it("refuses to materialize a tampered snapshot, copying nothing", async () => {
		const { targetDir, checkpointDir, destination } = await checkpointFixture();
		await recordCheckpoint(targetDir, checkpointDir, checkpointInputs);
		await Bun.write(
			join(checkpointDir, "workflow-state", "backlog", "config.yml"),
			"tampered\n",
		);
		await mkdir(destination, { recursive: true });

		expect(materializeCheckpoint(checkpointDir, destination)).rejects.toThrow(
			/backlog\/config.yml/u,
		);
		expect(await readdir(destination)).toEqual([]);
	});

	it("refuses a snapshot carrying a file the record does not list", async () => {
		const { targetDir, checkpointDir, destination } = await checkpointFixture();
		await recordCheckpoint(targetDir, checkpointDir, checkpointInputs);
		await Bun.write(
			join(checkpointDir, "workflow-state", "backlog", "planted.md"),
			"planted\n",
		);
		await mkdir(destination, { recursive: true });

		expect(materializeCheckpoint(checkpointDir, destination)).rejects.toThrow(
			/backlog\/planted.md/u,
		);
		expect(await readdir(destination)).toEqual([]);
	});

	it("refuses a record whose paths escape the destination", async () => {
		const { targetDir, checkpointDir, destination } = await checkpointFixture();
		const record = await recordCheckpoint(
			targetDir,
			checkpointDir,
			checkpointInputs,
		);
		await Bun.write(
			join(checkpointDir, "checkpoint.json"),
			JSON.stringify({
				...record,
				workflowState: [
					{ path: "../../../etc/hosts", sha256: "aa11".repeat(16) },
				],
			}),
		);
		await mkdir(destination, { recursive: true });

		expect(materializeCheckpoint(checkpointDir, destination)).rejects.toThrow();
		expect(await readdir(destination)).toEqual([]);
	});

	it("fails on an unreadable workflow path instead of recording it absent", async () => {
		const { targetDir, checkpointDir } = await checkpointFixture();
		await chmod(targetDir, 0o000);

		try {
			expect(
				recordCheckpoint(targetDir, checkpointDir, checkpointInputs),
			).rejects.toThrow(/permission denied|EACCES/iu);
		} finally {
			await chmod(targetDir, 0o755);
		}
	});

	it("orders recorded files by codepoint, not locale", async () => {
		const { targetDir, checkpointDir } = await checkpointFixture();

		const record = await recordCheckpoint(targetDir, checkpointDir, {
			...checkpointInputs,
			artifacts: [
				{ path: "a.md", sha256: "aa11".repeat(16) },
				{ path: "B.md", sha256: "bb22".repeat(16) },
			],
		});

		expect(record.artifacts.map(({ path }) => path)).toEqual(["B.md", "a.md"]);
	});

	it("snapshots only the workflow paths that exist", async () => {
		const { targetDir, checkpointDir } = await checkpointFixture();
		await rm(join(targetDir, ".boris"), { force: true, recursive: true });

		const record = await recordCheckpoint(
			targetDir,
			checkpointDir,
			checkpointInputs,
		);

		expect(
			record.workflowState.every(({ path }) => path.startsWith("backlog/")),
		).toBe(true);
	});
});

describe(initialCheckpointInputs.name, () => {
	const root = {
		taskSha: "task-sha",
		task: "Task text",
		productBrief: "Brief text",
		workflowFiles: [{ path: "backlog/config.yml", sha256: "aa11" }],
	} as const;

	it("checkpoints the run's initial state under the reserved name", () => {
		const inputs = initialCheckpointInputs(root, "sonnet", "high");

		expect(inputs.stage).toBe("initial");
		expect(inputs.targetSha).toBe("task-sha");
		expect(inputs.upstream).toBe(rootLineage(root));
		expect(inputs.corpusFiles).toEqual([]);
		expect(inputs.artifacts).toEqual([]);
		expect(inputs.effort).toBe("high");
	});

	it("carries the settings file the run declared", () => {
		const settingsFile = { path: "stage-settings.json", sha256: "ff66" };
		const inputs = initialCheckpointInputs(
			root,
			"sonnet",
			"high",
			settingsFile,
		);

		expect(inputs.settingsFile).toEqual(settingsFile);
	});

	it("serializes without an effort key when the run declared none", () => {
		const inputs = initialCheckpointInputs(root, "sonnet");

		expect(inputs.effort).toBeUndefined();
		expect(JSON.stringify(inputs)).not.toContain('"effort"');
	});
});

describe(corpusDifferences.name, () => {
	const wording = {
		modified: (path: string) => `${path} changed`,
		missingFromRight: (path: string) => `${path} removed`,
		missingFromLeft: (path: string) => `${path} added`,
	};
	const file = { path: "a", sha256: "hash" } as const;

	it("reports path-unique differences in sorted order", () => {
		const differences = corpusDifferences(
			[
				{ path: "b", sha256: "same" },
				{ path: "a", sha256: "old" },
			],
			[
				{ path: "c", sha256: "same" },
				{ path: "a", sha256: "new" },
			],
			wording,
		);

		expect(differences).toEqual(["a changed", "b removed", "c added"]);
	});

	it("rejects a duplicate path in the left corpus", () => {
		expect(() => corpusDifferences([file, file], [file], wording)).toThrow(
			/Duplicate corpus path: a/u,
		);
	});

	it("rejects a duplicate path in the right corpus", () => {
		expect(() => corpusDifferences([file], [file, file], wording)).toThrow(
			/Duplicate corpus path: a/u,
		);
	});
});

describe(deriveStaleness.name, () => {
	const claudeMd = { path: "CLAUDE.md", sha256: "aa11" } as const;
	const doctrine = {
		path: "skills/doctrine/SKILL.md",
		sha256: "dd44",
	} as const;

	function checkpoint(
		stage: string,
		upstream: string,
		corpusFiles: readonly { readonly path: string; readonly sha256: string }[],
		settingsFile?: HashedFile,
	): CheckpointRecord {
		const inputs = {
			stage,
			targetSha: `${stage}-sha`,
			upstream,
			model: "sonnet",
			effort: "high",
			corpusFiles,
			artifacts: [],
			settingsFile,
		} as const;

		return {
			...inputs,
			lineage: lineageKey(inputs),
			workflowState: [],
		};
	}

	const initial = checkpoint("initial", "root-key", []);
	const planning = checkpoint("shape", initial.lineage, [
		claudeMd,
		doctrine,
		{ path: "skills/shape/SKILL.md", sha256: "bb22" },
	]);
	const build = checkpoint("build", planning.lineage, [
		claudeMd,
		doctrine,
		{ path: "skills/build/SKILL.md", sha256: "cc33" },
	]);
	const chain = [initial, planning, build] as const;

	function currentCorpus(
		...edits: readonly (readonly [string, StageCorpus])[]
	): Map<string, StageCorpus> {
		const corpus = new Map<string, StageCorpus>(
			chain
				.filter(({ stage }) => stage !== "initial")
				.map((record) => [record.stage, hashedCorpus(record.corpusFiles)]),
		);
		for (const [stage, edit] of edits) {
			corpus.set(stage, edit);
		}

		return corpus;
	}

	const request = { model: "sonnet", effort: "high" } as const;

	it("reports every checkpoint fresh when nothing changed", () => {
		const staleness = deriveStaleness(chain, currentCorpus(), request);

		expect(staleness.map(({ stage, stale }) => [stage, stale])).toEqual([
			["initial", false],
			["shape", false],
			["build", false],
		]);
	});

	it("marks the edited stage and everything downstream stale, naming the file", () => {
		const staleness = deriveStaleness(
			chain,
			currentCorpus([
				"shape",
				hashedCorpus([
					claudeMd,
					doctrine,
					{ path: "skills/shape/SKILL.md", sha256: "changed" },
				]),
			]),
			request,
		);

		expect(staleness.map(({ stage, stale }) => [stage, stale])).toEqual([
			["initial", false],
			["shape", true],
			["build", true],
		]);
		expect(staleness[1]?.causes).toEqual(["skills/shape/SKILL.md changed"]);
		expect(staleness[2]?.causes).toEqual(["upstream stage shape is stale"]);
	});

	it("marks a checkpoint stale when the settings file's digest no longer matches", () => {
		const settingsFile = { path: "stage-settings.json", sha256: "ff66" };
		const withInitial = checkpoint("initial", "root-key", [], settingsFile);
		const nextStage = checkpoint(
			"shape",
			withInitial.lineage,
			[claudeMd, doctrine, { path: "skills/shape/SKILL.md", sha256: "bb22" }],
			settingsFile,
		);
		const withSettings = [withInitial, nextStage];

		const staleness = deriveStaleness(withSettings, currentCorpus(), {
			...request,
			settingsFile: { ...settingsFile, sha256: "changed" },
		});

		expect(staleness.map(({ stage, stale }) => [stage, stale])).toEqual([
			["initial", true],
			["shape", true],
		]);
		expect(staleness[0]?.causes).toEqual([
			"stage settings file stage-settings.json changed",
		]);
	});

	it("uses the current settings identity instead of a foreign recorded path", () => {
		const recorded = checkpoint("initial", "root-key", [], {
			path: "/Users/alice/old-checkout/stage-settings.json",
			sha256: "0".repeat(64),
		});

		const [staleness] = deriveStaleness([recorded], new Map(), {
			...request,
			settingsFile: {
				path: "stage-settings.json",
				sha256: "1".repeat(64),
			},
		});

		expect(staleness?.causes).toEqual([
			"stage settings file stage-settings.json changed",
		]);
	});

	it("marks a checkpoint stale when current settings are unavailable", () => {
		const refusal =
			"stage settings file cases/audit-log/settings.json is unavailable";

		const [staleness] = deriveStaleness([initial], new Map(), {
			...request,
			settingsFileRefusal: refusal,
		});

		expect(staleness?.causes).toEqual([refusal]);
	});

	it("blames the first stale stage, not the nearest, further down the chain", () => {
		const review = checkpoint("review", build.lineage, [
			claudeMd,
			doctrine,
			{ path: "skills/review/SKILL.md", sha256: "ee55" },
		]);
		const longer = [initial, planning, build, review] as const;
		const edited: readonly HashedFile[] = [
			claudeMd,
			doctrine,
			{ path: "skills/shape/SKILL.md", sha256: "changed" },
		];
		const corpus = new Map<string, StageCorpus>(
			longer
				.filter(({ stage }) => stage !== "initial")
				.map((record) => [
					record.stage,
					hashedCorpus(record.stage === "shape" ? edited : record.corpusFiles),
				]),
		);

		const staleness = deriveStaleness(longer, corpus, request);

		expect(staleness.map(({ stale }) => stale)).toEqual([
			false,
			true,
			true,
			true,
		]);
		expect(staleness[3]?.causes).toEqual(["upstream stage shape is stale"]);
	});

	it("marks every stage checkpoint stale when a global instruction file changes", () => {
		const edited = { path: "CLAUDE.md", sha256: "edited" } as const;
		const staleness = deriveStaleness(
			chain,
			currentCorpus(
				[
					"shape",
					hashedCorpus([
						edited,
						doctrine,
						{ path: "skills/shape/SKILL.md", sha256: "bb22" },
					]),
				],
				[
					"build",
					hashedCorpus([
						edited,
						doctrine,
						{ path: "skills/build/SKILL.md", sha256: "cc33" },
					]),
				],
			),
			request,
		);

		expect(staleness.map(({ stale }) => stale)).toEqual([false, true, true]);
		expect(staleness[1]?.causes).toEqual(["CLAUDE.md changed"]);
	});

	it("marks every stage checkpoint stale when a global skill file changes", () => {
		const edited = {
			path: "skills/doctrine/SKILL.md",
			sha256: "edited",
		} as const;
		const staleness = deriveStaleness(
			chain,
			currentCorpus(
				[
					"shape",
					hashedCorpus([
						claudeMd,
						edited,
						{ path: "skills/shape/SKILL.md", sha256: "bb22" },
					]),
				],
				[
					"build",
					hashedCorpus([
						claudeMd,
						edited,
						{ path: "skills/build/SKILL.md", sha256: "cc33" },
					]),
				],
			),
			request,
		);

		expect(staleness.map(({ stale }) => stale)).toEqual([false, true, true]);
		expect(staleness[1]?.causes).toEqual(["skills/doctrine/SKILL.md changed"]);
	});

	it("marks every stage checkpoint stale when a rulebook file changes", () => {
		const rule = {
			path: "rulebook/coding-style.md",
			sha256: "rr55",
		} as const;
		const ruledPlanning = checkpoint("shape", initial.lineage, [
			claudeMd,
			doctrine,
			rule,
			{ path: "skills/shape/SKILL.md", sha256: "bb22" },
		]);
		const ruledBuild = checkpoint("build", ruledPlanning.lineage, [
			claudeMd,
			doctrine,
			rule,
			{ path: "skills/build/SKILL.md", sha256: "cc33" },
		]);
		const ruledChain = [initial, ruledPlanning, ruledBuild] as const;
		const edited = { ...rule, sha256: "edited" };

		const staleness = deriveStaleness(
			ruledChain,
			new Map([
				[
					"shape",
					hashedCorpus([
						claudeMd,
						doctrine,
						edited,
						{ path: "skills/shape/SKILL.md", sha256: "bb22" },
					]),
				],
				["build", hashedCorpus(ruledBuild.corpusFiles)],
			]),
			request,
		);

		expect(staleness.map(({ stale }) => stale)).toEqual([false, true, true]);
		expect(staleness[1]?.causes).toEqual(["rulebook/coding-style.md changed"]);
		expect(staleness[2]?.causes).toEqual(["upstream stage shape is stale"]);
	});

	it("marks every checkpoint including the initial one stale on a model change", () => {
		const staleness = deriveStaleness(chain, currentCorpus(), {
			model: "opus",
			effort: "high",
		});

		expect(staleness.map(({ stale }) => stale)).toEqual([true, true, true]);
		expect(staleness[0]?.causes).toEqual(["model sonnet is now opus"]);
	});

	it("marks every checkpoint including the initial one stale on an effort change", () => {
		const staleness = deriveStaleness(chain, currentCorpus(), {
			model: "sonnet",
			effort: "low",
		});

		expect(staleness.map(({ stale }) => stale)).toEqual([true, true, true]);
		expect(staleness[0]?.causes).toEqual(["effort high is now low"]);
	});

	describe("when a stage's corpus could not be hashed", () => {
		it("marks that stage stale with the refusal as its cause", () => {
			const staleness = deriveStaleness(
				chain,
				currentCorpus([
					"shape",
					refusedCorpus("skills/shape resolves outside"),
				]),
				request,
			);

			expect(staleness[1]?.stale).toBe(true);
			expect(staleness[1]?.causes).toEqual(["skills/shape resolves outside"]);
		});

		it("carries the refusal downstream as an upstream cause", () => {
			const staleness = deriveStaleness(
				chain,
				currentCorpus([
					"shape",
					refusedCorpus("skills/shape resolves outside"),
				]),
				request,
			);

			expect(staleness.map(({ stale }) => stale)).toEqual([false, true, true]);
			expect(staleness[2]?.causes).toEqual(["upstream stage shape is stale"]);
		});
	});

	it("names a corpus file the record has and the corpus no longer does", () => {
		const staleness = deriveStaleness(
			chain,
			currentCorpus(["shape", hashedCorpus([claudeMd, doctrine])]),
			request,
		);

		expect(staleness[1]?.stale).toBe(true);
		expect(staleness[1]?.causes).toEqual(["skills/shape/SKILL.md removed"]);
	});

	it("names a corpus file the corpus has and the record does not", () => {
		const staleness = deriveStaleness(
			chain,
			currentCorpus([
				"shape",
				hashedCorpus([
					claudeMd,
					doctrine,
					{ path: "skills/shape/SKILL.md", sha256: "bb22" },
					{ path: "skills/shape/references/new.md", sha256: "ee55" },
				]),
			]),
			request,
		);

		expect(staleness[1]?.stale).toBe(true);
		expect(staleness[1]?.causes).toEqual([
			"skills/shape/references/new.md added",
		]);
	});
});

describe(rootLineage.name, () => {
	const base = {
		taskSha: "task-sha",
		task: "Task text",
		productBrief: "Brief text",
		workflowFiles: [{ path: "backlog/config.yml", sha256: "aa11" }],
	} as const;

	it("returns the same key for the same initial state", () => {
		expect(rootLineage({ ...base })).toBe(rootLineage({ ...base }));
	});

	it("changes when any part of the initial state changes", () => {
		const variants = [
			rootLineage({ ...base, taskSha: "other-sha" }),
			rootLineage({ ...base, task: "Other task" }),
			rootLineage({ ...base, productBrief: "Other brief" }),
			rootLineage({ ...base, workflowFiles: [] }),
		];

		expect(new Set([rootLineage(base), ...variants]).size).toBe(
			variants.length + 1,
		);
	});
});

describe(corpusLayoutRoots.name, () => {
	it("searches the project layout root before the user's", () => {
		const source = {
			kind: "live",
			root: "/install",
			backingRoot: "/backing",
		} as const;

		expect(corpusLayoutRoots("/target", source)).toEqual([
			{ kind: "directory", root: "/target/.claude" },
			source,
		]);
	});
});

describe(stageCorpusRoots.name, () => {
	it("searches project level before user level for the live install", () => {
		const source = {
			kind: "live",
			root: "/install",
			backingRoot: "/backing",
		} as const;

		expect(stageCorpusRoots(source, "/target")).toEqual([
			{ kind: "directory", root: "/target/.claude" },
			source,
		]);
	});

	it("searches only the resolved root for a directory corpus", () => {
		expect(
			stageCorpusRoots(
				{ kind: "directory", root: "/variants/brief" },
				"/target",
			),
		).toEqual([{ kind: "directory", root: "/variants/brief" }]);
	});
});

describe(hashWorkflowState.name, () => {
	it("refuses a target whose backlog tree is itself a symlink, rather than hashing what it points at", async () => {
		const parent = await mkdtemp(join(tmpdir(), "rehearse-workflow-state-"));
		testResources.track(parent);
		const outside = join(parent, "outside");
		await mkdir(outside);
		await writeFile(join(outside, "control.key"), "secret bytes");
		const target = join(parent, "target");
		await mkdir(target);
		await symlink(outside, join(target, "backlog"));

		const failure = await failureOf(hashWorkflowState(target));

		expect(failure).toBeInstanceOf(SymlinkedEntryError);
		expect(failure.message).toContain("backlog");
	});

	it("refuses a target whose backlog tree holds a symlink, rather than hashing what it points at", async () => {
		const parent = await mkdtemp(join(tmpdir(), "rehearse-workflow-state-"));
		testResources.track(parent);
		const outside = join(parent, "outside");
		await mkdir(outside);
		await writeFile(join(outside, "control.key"), "secret bytes");
		const target = join(parent, "target");
		await mkdir(join(target, "backlog"), { recursive: true });
		await writeFile(join(target, "backlog", "board.md"), "board");
		await symlink(outside, join(target, "backlog", "escape"));

		const failure = await failureOf(hashWorkflowState(target));

		expect(failure).toBeInstanceOf(SymlinkedEntryError);
		expect(failure.message).toContain("escape");
	});
});

describe(hashDirectory.name, () => {
	it("hashes a file reached through a link that resolves back inside the walked tree", async () => {
		const parent = await mkdtemp(join(tmpdir(), "rehearse-hash-directory-"));
		testResources.track(parent);
		const root = join(parent, "corpus");
		await mkdir(join(root, "build"), { recursive: true });
		await writeFile(join(root, "build", "SKILL.md"), "real skill");
		await symlink(
			join(root, "build", "SKILL.md"),
			join(root, "build", "ALIAS.md"),
		);

		const hashed = await hashDirectory(root, "skills", {
			rootMayBeALink: false,
		});

		expect(hashed.map(({ path }) => path)).toEqual([
			"skills/build/ALIAS.md",
			"skills/build/SKILL.md",
		]);
	});

	it("hashes the files under a root that is itself a symlink", async () => {
		const parent = await mkdtemp(join(tmpdir(), "rehearse-hash-directory-"));
		testResources.track(parent);
		const real = join(parent, "real");
		await mkdir(real);
		await writeFile(join(real, "CLAUDE.md"), "instructions");
		await symlink(real, join(parent, "link"));

		const files = await hashDirectory(join(parent, "link"), "", {
			rootMayBeALink: true,
		});

		expect(files).toEqual([
			{
				path: "CLAUDE.md",
				sha256:
					"238fa28a94976c7da14563bc873c2729bd5cd325389085bb4c6dd0de28923590",
			},
		]);
	});

	describe("when the walk lists an entry that is a symlink", () => {
		it("throws SymlinkedEntryError naming the entry, without the target's bytes", async () => {
			const parent = await mkdtemp(join(tmpdir(), "rehearse-hash-directory-"));
			testResources.track(parent);
			const outside = join(parent, "outside");
			await mkdir(outside);
			await writeFile(join(outside, "control.key"), "secret bytes");
			const walked = join(parent, "walked");
			await mkdir(walked);
			await writeFile(join(walked, "CLAUDE.md"), "instructions");
			await symlink(outside, join(walked, "evil"));

			const failure = await failureOf(
				hashDirectory(walked, "", { rootMayBeALink: true }),
			);

			expect(failure).toBeInstanceOf(SymlinkedEntryError);
			expect(failure.message).toContain("evil");
			expect(failure.message).not.toContain("secret bytes");
		});

		it("throws for a link whose target is gone, which stat alone reports as a missing entry", async () => {
			const directory = await mkdtemp(
				join(tmpdir(), "rehearse-hash-directory-"),
			);
			testResources.track(directory);
			await writeFile(join(directory, "CLAUDE.md"), "instructions");
			await symlink(
				join(directory, "does-not-exist"),
				join(directory, "broken-link"),
			);

			const failure = await failureOf(
				hashDirectory(directory, "", { rootMayBeALink: true }),
			);

			expect(failure).toBeInstanceOf(SymlinkedEntryError);
			expect(failure.message).toContain("broken-link");
		});

		it("says the target is missing for a link that never left the tree, rather than accusing it of resolving outside", async () => {
			const directory = await mkdtemp(
				join(tmpdir(), "rehearse-hash-directory-"),
			);
			testResources.track(directory);
			await symlink(join(directory, "gone.md"), join(directory, "dangle.md"));

			const failure = await failureOf(
				hashDirectory(directory, "agents", { rootMayBeALink: true }),
			);

			expect(failure.message).toBe(
				"agents/dangle.md is a link whose target is missing, so the bytes it names cannot be read",
			);
		});
	});
});
