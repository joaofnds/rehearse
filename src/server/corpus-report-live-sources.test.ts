import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { directorySource } from "#benchmark/run-records-test-support";
import {
	clearCorpusReportRoots,
	corpusDirectory,
	fullCorpusDirectory,
	runsDirectory,
} from "#server/corpus-report-workspace-test-fixture";

import { corpusReport } from "./corpus-report";

afterEach(clearCorpusReportRoots);

describe(corpusReport.name, () => {
	it(
		"refuses a live instruction file outside the install and declared backing tree",
		verifyRefusesALiveInstructionFileOutsideTheInstallAnd,
	);

	it(
		"reports permitted backing-tree links like the same corpus stored locally",
		verifyReportsPermittedBackingTreeLinksLikeTheSameCorpus,
	);

	it(
		"reports a root reached through a symlinked parent directory, since the link does not leave the corpus",
		verifyReportsARootReachedThroughASymlinkedParentDirectory,
	);
});

async function verifyRefusesALiveInstructionFileOutsideTheInstallAnd(): Promise<void> {
	const source = await escapedLiveInstructions();

	const report = await corpusReport(source, await runsDirectory());

	expect(report.files.map(({ path }) => path)).toEqual([
		"skills/build/SKILL.md",
	]);
	expect(report.refusals).toEqual([
		"Corpus file CLAUDE.md resolves outside the live corpus extent, which would hash bytes the corpus does not hold",
	]);
	expect(report.digest).toBeUndefined();
	expect(JSON.stringify(report)).not.toContain("SECRET BYTES");
}

async function verifyReportsPermittedBackingTreeLinksLikeTheSameCorpus(): Promise<void> {
	const { root, backingRoot, localRoot } = await linkedBackingCorpus();
	const runs = await runsDirectory();

	const linked = await corpusReport({ backingRoot, kind: "live", root }, runs);
	const local = await corpusReport(directorySource(localRoot), runs);

	expect(linked.files.map(({ path, sha256 }) => ({ path, sha256 }))).toEqual(
		local.files.map(({ path, sha256 }) => ({ path, sha256 })),
	);
	expect(linked.refusals).toEqual([]);
	expect(linked.digest).toBe(local.digest);
}

async function verifyReportsARootReachedThroughASymlinkedParentDirectory(): Promise<void> {
	const parent = await corpusDirectory();
	const root = join(parent, "corpus");
	await mkdir(root, { recursive: true });
	await writeFile(join(root, "CLAUDE.md"), "instructions\n");
	const linkedParent = join(await corpusDirectory(), "link");
	await symlink(parent, linkedParent);

	const report = await corpusReport(
		directorySource(join(linkedParent, "corpus")),
		await runsDirectory(),
	);

	expect(report.files.map(({ path }) => path)).toEqual(["CLAUDE.md"]);
}

async function escapedLiveInstructions(): Promise<{
	readonly root: string;
	readonly backingRoot: string;
	readonly kind: "live";
}> {
	const root = await corpusDirectory();
	const backingRoot = await corpusDirectory();
	const outside = await corpusDirectory();
	await mkdir(join(root, "skills", "build"), { recursive: true });
	await writeFile(join(root, "skills", "build", "SKILL.md"), "build skill\n");
	await writeFile(join(outside, "secret.md"), "SECRET BYTES\n");
	await symlink(join(outside, "secret.md"), join(root, "CLAUDE.md"));

	return { backingRoot, kind: "live" as const, root };
}

async function linkedBackingCorpus(): Promise<{
	readonly root: string;
	readonly backingRoot: string;
	readonly localRoot: string;
}> {
	const root = await corpusDirectory();
	const backingRoot = await fullCorpusDirectory();
	const localRoot = await fullCorpusDirectory();
	await symlink(join(backingRoot, "CLAUDE.md"), join(root, "CLAUDE.md"));
	await symlink(join(backingRoot, "skills"), join(root, "skills"));

	return { backingRoot, localRoot, root };
}
