import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand } from "#benchmark/command";
import { projectSlug } from "#benchmark/session-capture";
import { recordStageReads } from "#benchmark/stage-reads";
import { currentSha } from "#benchmark/target";
import { TestResources, commitAll } from "#benchmark/test-support";

const testResources = TestResources.forEachTest();

function readLine(path: string): string {
	return JSON.stringify({
		type: "assistant",
		message: {
			content: [
				{ type: "tool_use", id: "t", name: "Read", input: { file_path: path } },
			],
		},
	});
}

describe("recordStageReads", () => {
	it("hashes the project instructions a stage read as its starting commit held them", async () => {
		const target = await testResources.createRepository();
		await Bun.write(
			join(target.directory, "CLAUDE.md"),
			"as the stage found it\n",
		);
		await commitAll(target.directory, "docs: add instructions");
		const startSha = await currentSha(target.directory);
		await Bun.write(
			join(target.directory, "CLAUDE.md"),
			"as the stage left it\n",
		);
		await mkdir(join(target.directory, "docs"));
		await Bun.write(join(target.directory, "docs", "AGENTS.md"), "new\n");
		const projectsDirectory = await mkdtemp(
			join(tmpdir(), "rehearse-projects-"),
		);
		testResources.track(projectsDirectory);
		const slug = join(projectsDirectory, projectSlug(target.directory));
		await mkdir(slug, { recursive: true });
		await Bun.write(
			join(slug, "session.jsonl"),
			[
				readLine(join(target.directory, "CLAUDE.md")),
				readLine(join(target.directory, "docs", "AGENTS.md")),
			].join("\n"),
		);

		const manifest = await recordStageReads({
			targetDir: target.directory,
			startSha,
			transcript: { sessionId: "session", projectsDirectory },
			skill: "shape",
			corpusSources: [],
			corpusFiles: [],
			versionFiles: [],
			rubric: { path: "rubrics/shape.json", sha256: "e".repeat(64) },
		});

		expect(manifest.filter(({ half }) => half === "project")).toEqual([
			{
				path: "CLAUDE.md",
				half: "project",
				role: "project instructions",
				evidence: "observed",
				sha256: createHash("sha256")
					.update("as the stage found it\n")
					.digest("hex"),
			},
			{
				path: "docs/AGENTS.md",
				half: "project",
				role: "project instructions",
				evidence: "observed",
			},
		]);
	});

	async function transcriptOf(
		targetDirectory: string,
		paths: readonly string[],
	): Promise<string> {
		const projectsDirectory = await mkdtemp(
			join(tmpdir(), "rehearse-projects-"),
		);
		testResources.track(projectsDirectory);
		const slug = join(projectsDirectory, projectSlug(targetDirectory));
		await mkdir(slug, { recursive: true });
		await Bun.write(
			join(slug, "session.jsonl"),
			paths.map((path) => readLine(path)).join("\n"),
		);

		return projectsDirectory;
	}

	it("records only a read under the stage's corpus root as a corpus entry", async () => {
		const target = await testResources.createRepository();
		const startSha = await currentSha(target.directory);
		const corpusRoot = await mkdtemp(join(tmpdir(), "rehearse-corpus-"));
		testResources.track(corpusRoot);
		const elsewhere = await mkdtemp(join(tmpdir(), "rehearse-elsewhere-"));
		testResources.track(elsewhere);
		const projectsDirectory = await transcriptOf(target.directory, [
			join(corpusRoot, "skills", "delivery", "SKILL.md"),
			join(elsewhere, ".claude", "skills", "planted", "SKILL.md"),
		]);

		const manifest = await recordStageReads({
			targetDir: target.directory,
			startSha,
			transcript: { sessionId: "session", projectsDirectory },
			skill: "shape",
			corpusSources: [corpusRoot],
			corpusFiles: [],
			versionFiles: [
				{ path: "skills/delivery/SKILL.md", sha256: "d".repeat(64) },
				{ path: "skills/planted/SKILL.md", sha256: "a".repeat(64) },
			],
			rubric: { path: "rubrics/shape.json", sha256: "e".repeat(64) },
		});

		expect(manifest.filter(({ evidence }) => evidence === "observed")).toEqual([
			{
				path: "skills/delivery/SKILL.md",
				half: "corpus",
				role: "read for context",
				evidence: "observed",
				sha256: "d".repeat(64),
			},
		]);
	});

	it("marks a read from the target's own .claude as from the target, hashed at its starting commit", async () => {
		const target = await testResources.createRepository();
		await mkdir(join(target.directory, ".claude", "skills", "local"), {
			recursive: true,
		});
		await Bun.write(
			join(target.directory, ".claude", "skills", "local", "SKILL.md"),
			"as the target held it\n",
		);
		await runCommand(["git", "add", "--force", ".claude"], target.directory);
		await commitAll(target.directory, "chore: add a local skill");
		const startSha = await currentSha(target.directory);
		const corpusRoot = await mkdtemp(join(tmpdir(), "rehearse-corpus-"));
		testResources.track(corpusRoot);
		const projectsDirectory = await transcriptOf(target.directory, [
			join(target.directory, ".claude", "skills", "local", "SKILL.md"),
		]);

		const manifest = await recordStageReads({
			targetDir: target.directory,
			startSha,
			transcript: { sessionId: "session", projectsDirectory },
			skill: "shape",
			corpusSources: [corpusRoot],
			corpusFiles: [],
			versionFiles: [{ path: "skills/local/SKILL.md", sha256: "c".repeat(64) }],
			rubric: { path: "rubrics/shape.json", sha256: "e".repeat(64) },
		});

		expect(manifest.filter(({ evidence }) => evidence === "observed")).toEqual([
			{
				path: ".claude/skills/local/SKILL.md",
				half: "project",
				role: "read for context",
				evidence: "observed",
				sha256: createHash("sha256")
					.update("as the target held it\n")
					.digest("hex"),
			},
		]);
	});

	it("counts only the files the harness installed in the stage's .claude as corpus reads", async () => {
		const target = await testResources.createRepository();
		const startSha = await currentSha(target.directory);
		const claude = join(target.directory, ".claude");
		const projectsDirectory = await transcriptOf(target.directory, [
			join(claude, "skills", "delivery", "SKILL.md"),
			join(claude, "skills", "planted", "SKILL.md"),
			join(claude, "notes.md"),
		]);

		const manifest = await recordStageReads({
			targetDir: target.directory,
			startSha,
			transcript: { sessionId: "session", projectsDirectory },
			skill: "shape",
			corpusSources: [],
			corpusFiles: [
				{ path: "skills/delivery/SKILL.md", sha256: "d".repeat(64) },
			],
			versionFiles: [
				{ path: "skills/delivery/SKILL.md", sha256: "d".repeat(64) },
				{ path: "skills/planted/SKILL.md", sha256: "a".repeat(64) },
			],
			rubric: { path: "rubrics/shape.json", sha256: "e".repeat(64) },
		});

		expect(manifest.filter(({ evidence }) => evidence === "observed")).toEqual([
			{
				path: "skills/delivery/SKILL.md",
				half: "corpus",
				role: "read for context",
				evidence: "observed",
				sha256: "d".repeat(64),
			},
			{
				path: ".claude/skills/planted/SKILL.md",
				half: "project",
				role: "read for context",
				evidence: "observed",
			},
			{
				path: ".claude/notes.md",
				half: "project",
				role: "read for context",
				evidence: "observed",
			},
		]);
	});

	it("records a target skill the corpus resolved in its place once, as the corpus's", async () => {
		const target = await testResources.createRepository();
		const startSha = await currentSha(target.directory);
		const corpusRoot = await mkdtemp(join(tmpdir(), "rehearse-corpus-"));
		testResources.track(corpusRoot);
		const projectsDirectory = await transcriptOf(target.directory, [
			join(target.directory, ".claude", "skills", "local", "SKILL.md"),
		]);

		const manifest = await recordStageReads({
			targetDir: target.directory,
			startSha,
			transcript: { sessionId: "session", projectsDirectory },
			skill: "shape",
			corpusSources: [corpusRoot],
			corpusFiles: [{ path: "skills/local/SKILL.md", sha256: "c".repeat(64) }],
			versionFiles: [{ path: "skills/local/SKILL.md", sha256: "c".repeat(64) }],
			rubric: { path: "rubrics/shape.json", sha256: "e".repeat(64) },
		});

		expect(manifest.filter(({ evidence }) => evidence === "observed")).toEqual([
			{
				path: "skills/local/SKILL.md",
				half: "corpus",
				role: "read for context",
				evidence: "observed",
				sha256: "c".repeat(64),
			},
		]);
	});

	it("finds a target .claude read recorded under the link-resolved target path", async () => {
		const target = await testResources.createRepository();
		const startSha = await currentSha(target.directory);
		const links = await mkdtemp(join(tmpdir(), "rehearse-links-"));
		testResources.track(links);
		const linked = join(links, "target");
		await symlink(target.directory, linked);
		const projectsDirectory = await transcriptOf(linked, [
			join(await realpath(target.directory), ".claude", "notes.md"),
		]);

		const manifest = await recordStageReads({
			targetDir: linked,
			startSha,
			transcript: { sessionId: "session", projectsDirectory },
			skill: "shape",
			corpusSources: [],
			corpusFiles: [],
			versionFiles: [],
			rubric: { path: "rubrics/shape.json", sha256: "e".repeat(64) },
		});

		expect(manifest.filter(({ evidence }) => evidence === "observed")).toEqual([
			{
				path: ".claude/notes.md",
				half: "project",
				role: "read for context",
				evidence: "observed",
			},
		]);
	});
});
