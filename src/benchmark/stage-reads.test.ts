import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, realpath, symlink } from "node:fs/promises";
import { join } from "node:path";

import { runCommand } from "#benchmark/command";
import { recordStageReads } from "#benchmark/stage-reads";
import { currentSha } from "#benchmark/target";
import { TestResources, commitAll } from "#benchmark/test-support";

import StageReadsRequestBuilder from "./stage-reads-request-test-builder";
import StageReadsWorkspace from "./stage-reads-workspace-test-fixture";

const SHA256_HEX_DIGITS = 64;
const testResources = TestResources.forEachTest();
const workspace = new StageReadsWorkspace(testResources);
const recordsProjectStartingHashes = async (): Promise<void> => {
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
	const projectsDirectory = await workspace.transcriptOf(target.directory, [
		join(target.directory, "CLAUDE.md"),
		join(target.directory, "docs", "AGENTS.md"),
	]);

	const manifest = await recordStageReads(
		new StageReadsRequestBuilder({
			startSha,
			targetDir: target.directory,
			transcript: { projectsDirectory, sessionId: "session" },
		}).build(),
	);

	expect(manifest.filter(({ half }) => half === "project")).toEqual([
		{
			evidence: "observed",
			half: "project",
			path: "CLAUDE.md",
			role: "project instructions",
			sha256: createHash("sha256")
				.update("as the stage found it\n")
				.digest("hex"),
		},
		{
			evidence: "observed",
			half: "project",
			path: "docs/AGENTS.md",
			role: "project instructions",
		},
	]);
};

const recordsTargetSkillStartingHash = async (): Promise<void> => {
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
	const corpusRoot = await workspace.temporaryRoot("rehearse-corpus-");
	const projectsDirectory = await workspace.transcriptOf(target.directory, [
		join(target.directory, ".claude", "skills", "local", "SKILL.md"),
	]);

	const manifest = await recordStageReads(
		new StageReadsRequestBuilder({
			corpusSources: [corpusRoot],
			startSha,
			targetDir: target.directory,
			transcript: { projectsDirectory, sessionId: "session" },
			versionFiles: [
				{
					path: "skills/local/SKILL.md",
					sha256: "c".repeat(SHA256_HEX_DIGITS),
				},
			],
		}).build(),
	);

	expect(manifest.filter(({ evidence }) => evidence === "observed")).toEqual([
		{
			evidence: "observed",
			half: "project",
			path: ".claude/skills/local/SKILL.md",
			role: "read for context",
			sha256: createHash("sha256")
				.update("as the target held it\n")
				.digest("hex"),
		},
	]);
};

const recordsLinkedTargetReads = async (): Promise<void> => {
	const target = await testResources.createRepository();
	const startSha = await currentSha(target.directory);
	const links = await workspace.temporaryRoot("rehearse-links-");
	const linked = join(links, "target");
	await symlink(target.directory, linked);
	const projectsDirectory = await workspace.transcriptOf(linked, [
		join(await realpath(target.directory), ".claude", "notes.md"),
	]);

	const manifest = await recordStageReads(
		new StageReadsRequestBuilder({
			startSha,
			targetDir: linked,
			transcript: { projectsDirectory, sessionId: "session" },
		}).build(),
	);

	expect(manifest.filter(({ evidence }) => evidence === "observed")).toEqual([
		{
			evidence: "observed",
			half: "project",
			path: ".claude/notes.md",
			role: "read for context",
		},
	]);
};
describe("project stage reads", () => {
	it(
		"hashes the project instructions a stage read as its starting commit held them",
		recordsProjectStartingHashes,
	);
	it(
		"marks a read from the target's own .claude as from the target, hashed at its starting commit",
		recordsTargetSkillStartingHash,
	);
	it(
		"finds a target .claude read recorded under the link-resolved target path",
		recordsLinkedTargetReads,
	);
});
