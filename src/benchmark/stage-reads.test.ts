import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
			corpusFiles: [],
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
});
