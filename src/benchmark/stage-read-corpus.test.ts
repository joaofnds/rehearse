import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { recordStageReads } from "#benchmark/stage-reads";
import { currentSha } from "#benchmark/target";
import { TestResources } from "#benchmark/test-support";

import StageReadsRequestBuilder from "./stage-reads-request-test-builder";
import StageReadsWorkspace from "./stage-reads-workspace-test-fixture";

const SHA256_HEX_DIGITS = 64;
const deliveryVersionFiles = [
	{
		path: "skills/delivery/SKILL.md",
		sha256: "d".repeat(SHA256_HEX_DIGITS),
	},
	{
		path: "skills/planted/SKILL.md",
		sha256: "a".repeat(SHA256_HEX_DIGITS),
	},
];
const testResources = TestResources.forEachTest();
const workspace = new StageReadsWorkspace(testResources);
const recordsConfiguredCorpusRoots = async (): Promise<void> => {
	const target = await testResources.createRepository();
	const startSha = await currentSha(target.directory);
	const corpusRoot = await workspace.temporaryRoot("rehearse-corpus-");
	const elsewhere = await workspace.temporaryRoot("rehearse-elsewhere-");
	const projectsDirectory = await workspace.transcriptOf(target.directory, [
		join(corpusRoot, "skills", "delivery", "SKILL.md"),
		join(elsewhere, ".claude", "skills", "planted", "SKILL.md"),
	]);

	const manifest = await recordStageReads(
		new StageReadsRequestBuilder({
			corpusSources: [corpusRoot],
			startSha,
			targetDir: target.directory,
			transcript: { projectsDirectory, sessionId: "session" },
			versionFiles: deliveryVersionFiles,
		}).build(),
	);

	expect(manifest.filter(({ evidence }) => evidence === "observed")).toEqual([
		{
			evidence: "observed",
			half: "corpus",
			path: "skills/delivery/SKILL.md",
			role: "read for context",
			sha256: "d".repeat(SHA256_HEX_DIGITS),
		},
	]);
};

const recordsInstalledCorpusReads = async (): Promise<void> => {
	const target = await testResources.createRepository();
	const startSha = await currentSha(target.directory);
	const claude = join(target.directory, ".claude");
	const projectsDirectory = await workspace.transcriptOf(target.directory, [
		join(claude, "skills", "delivery", "SKILL.md"),
		join(claude, "skills", "planted", "SKILL.md"),
		join(claude, "notes.md"),
	]);

	const manifest = await recordStageReads(
		new StageReadsRequestBuilder({
			corpusFiles: [
				{
					path: "skills/delivery/SKILL.md",
					sha256: "d".repeat(SHA256_HEX_DIGITS),
				},
			],
			startSha,
			targetDir: target.directory,
			transcript: { projectsDirectory, sessionId: "session" },
			versionFiles: deliveryVersionFiles,
		}).build(),
	);

	expect(manifest.filter(({ evidence }) => evidence === "observed")).toEqual([
		{
			evidence: "observed",
			half: "corpus",
			path: "skills/delivery/SKILL.md",
			role: "read for context",
			sha256: "d".repeat(SHA256_HEX_DIGITS),
		},
		{
			evidence: "observed",
			half: "project",
			path: ".claude/skills/planted/SKILL.md",
			role: "read for context",
		},
		{
			evidence: "observed",
			half: "project",
			path: ".claude/notes.md",
			role: "read for context",
		},
	]);
};

const recordsShadowedCorpusSkill = async (): Promise<void> => {
	const target = await testResources.createRepository();
	const startSha = await currentSha(target.directory);
	const corpusRoot = await workspace.temporaryRoot("rehearse-corpus-");
	const projectsDirectory = await workspace.transcriptOf(target.directory, [
		join(target.directory, ".claude", "skills", "local", "SKILL.md"),
	]);

	const manifest = await recordStageReads(
		new StageReadsRequestBuilder({
			corpusFiles: [
				{
					path: "skills/local/SKILL.md",
					sha256: "c".repeat(SHA256_HEX_DIGITS),
				},
			],
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
			half: "corpus",
			path: "skills/local/SKILL.md",
			role: "read for context",
			sha256: "c".repeat(SHA256_HEX_DIGITS),
		},
	]);
};
describe("corpus stage reads", () => {
	it(
		"records only a read under the stage's corpus root as a corpus entry",
		recordsConfiguredCorpusRoots,
	);
	it(
		"counts only the files the harness installed in the stage's .claude as corpus reads",
		recordsInstalledCorpusReads,
	);
	it(
		"records a target skill the corpus resolved in its place once, as the corpus's",
		recordsShadowedCorpusSkill,
	);
});
