import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
	RecordedRunsFixture,
	directorySource,
} from "#benchmark/run-records-test-support";
import {
	clearCorpusReportRoots,
	corpusDirectory,
	fullCorpusDirectory,
	unreadableAgentCorpus,
} from "#server/corpus-report-workspace-test-fixture";

import type { CorpusReport } from "./corpus-report";
import { corpusReport } from "./corpus-report";

afterEach(clearCorpusReportRoots);

async function reportOverEscapingSkills(): Promise<CorpusReport> {
	const root = await fullCorpusDirectory();
	const outside = await corpusDirectory();
	await writeFile(join(outside, "secret.md"), "secret bytes\n");
	await mkdir(join(root, "agents"), { recursive: true });
	await writeFile(join(root, "agents", "normal.md"), "an agent\n");
	await symlink(join(outside, "secret.md"), join(root, "skills", "escape.md"));
	const runs = await corpusDirectory();
	await new RecordedRunsFixture(runs).write();

	return await corpusReport(directorySource(root), runs);
}

describe(corpusReport.name, () => {
	describe("when a layout directory holds a symlink resolving outside the root", () => {
		it(
			"reports every file under the layout directories that hashed whole, including one walked after the refusal",
			verifyReportsEveryFileUnderTheLayoutDirectoriesThatHashed,
		);

		it(
			"names every offending entry in the directory, so an earlier one cannot hide a later one",
			verifyNamesEveryOffendingEntryInTheDirectorySoAn,
		);

		it(
			"names the refused entry without an absolute path",
			verifyNamesTheRefusedEntryWithoutAnAbsolutePath,
		);

		it(
			"carries no corpus root digest, since a digest over a partial tree names a corpus nobody holds",
			verifyCarriesNoCorpusRootDigestSinceADigestOver,
		);
	});
});

describe(corpusReport.name, () => {
	it(
		"reports the refusal for a symlinked directory under a layout directory, rather than what it points at",
		verifyReportsTheRefusalForASymlinkedDirectoryUnderA,
	);

	it(
		"redacts an absolute path out of a refusal, since a refusal is served to a browser",
		verifyRedactsAnAbsolutePathOutOfARefusalSince,
	);

	it(
		"names a self-referential layout directory as a refusal, rather than failing the report",
		verifyNamesASelfReferentialLayoutDirectoryAsARefusal,
	);

	it(
		"names a file occupying a layout directory path as a refusal, rather than failing the report",
		verifyNamesAFileOccupyingALayoutDirectoryPathAs,
	);

	it(
		"names a layout entry it cannot read as a refusal, rather than failing the report",
		verifyNamesALayoutEntryItCannotReadAsA,
	);

	it(
		"names a self-referential link as a refusal, though the whole listing of its directory fails",
		verifyNamesASelfReferentialLinkAsARefusalThough,
	);

	it(
		"names both an unreadable entry and an escaping one, so neither hides the other",
		verifyNamesBothAnUnreadableEntryAndAnEscapingOne,
	);
});

async function verifyReportsEveryFileUnderTheLayoutDirectoriesThatHashed(): Promise<void> {
	const report = await reportOverEscapingSkills();

	expect(report.files.map(({ path }) => path)).toEqual([
		"CLAUDE.md",
		"agents/normal.md",
	]);
}

async function verifyNamesEveryOffendingEntryInTheDirectorySoAn(): Promise<void> {
	const root = await fullCorpusDirectory();
	const outside = await corpusDirectory();
	await writeFile(join(outside, "secret.md"), "secret bytes\n");
	await mkdir(join(root, "agents"), { recursive: true });
	await symlink(
		join(root, "aardvark-gone.md"),
		join(root, "agents", "aardvark.md"),
	);
	await symlink(join(outside, "secret.md"), join(root, "agents", "escape.md"));
	const runs = await corpusDirectory();
	await new RecordedRunsFixture(runs).write();

	const report = await corpusReport(directorySource(root), runs);

	expect(report.refusals).toEqual([
		"agents/aardvark.md is a link whose target is missing, so the bytes it names cannot be read",
		"agents/escape.md resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
	]);
}

async function verifyNamesTheRefusedEntryWithoutAnAbsolutePath(): Promise<void> {
	const report = await reportOverEscapingSkills();

	expect(report.refusals).toEqual([
		"skills/escape.md resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
	]);
}

async function verifyCarriesNoCorpusRootDigestSinceADigestOver(): Promise<void> {
	const report = await reportOverEscapingSkills();

	expect(report.digest).toBeUndefined();
}

async function verifyReportsTheRefusalForASymlinkedDirectoryUnderA(): Promise<void> {
	const root = await fullCorpusDirectory();
	const outside = await corpusDirectory();
	await writeFile(join(outside, "control.key"), "secret bytes\n");
	await symlink(outside, join(root, "skills", "escape"));
	const runs = await corpusDirectory();
	await new RecordedRunsFixture(runs).write();

	const report = await corpusReport(directorySource(root), runs);

	expect(report.files.map(({ path }) => path)).toEqual(["CLAUDE.md"]);
	expect(report.refusals).toEqual([
		"skills/escape resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
	]);
	expect(JSON.stringify(report.refusals)).not.toContain("control.key");
}

async function verifyRedactsAnAbsolutePathOutOfARefusalSince(): Promise<void> {
	const root = await fullCorpusDirectory();
	const outside = await corpusDirectory();
	await symlink(outside, join(root, "agents"));
	const runs = await corpusDirectory();
	await new RecordedRunsFixture(runs).write();

	const report = await corpusReport(directorySource(root), runs);

	expect(report.refusals).toEqual([
		"agents resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
	]);
}

async function verifyNamesASelfReferentialLayoutDirectoryAsARefusal(): Promise<void> {
	const root = await fullCorpusDirectory();
	await symlink(join(root, "agents"), join(root, "agents"));
	const runs = await corpusDirectory();
	await new RecordedRunsFixture(runs).write();

	const report = await corpusReport(directorySource(root), runs);

	expect(report.files.map(({ path }) => path)).toEqual([
		"CLAUDE.md",
		"skills/build/SKILL.md",
		"skills/discuss/SKILL.md",
	]);
	expect(report.refusals).toEqual([
		"agents is a link that never resolves to a file, so it names no bytes",
	]);
	expect(report.digest).toBeUndefined();
}

async function verifyNamesAFileOccupyingALayoutDirectoryPathAs(): Promise<void> {
	const root = await fullCorpusDirectory();
	await writeFile(join(root, "agents"), "not a directory\n");
	const runs = await corpusDirectory();
	await new RecordedRunsFixture(runs).write();

	const report = await corpusReport(directorySource(root), runs);

	expect(report.files.map(({ path }) => path)).toEqual([
		"CLAUDE.md",
		"skills/build/SKILL.md",
		"skills/discuss/SKILL.md",
	]);
	expect(report.refusals).toEqual([
		"agents is not a directory, so it cannot contain corpus files to hash",
	]);
	expect(report.digest).toBeUndefined();
}

async function verifyNamesALayoutEntryItCannotReadAsA(): Promise<void> {
	const root = await unreadableAgentCorpus("unreadable.md", true);
	const runs = await corpusDirectory();
	await new RecordedRunsFixture(runs).write();

	const report = await corpusReport(directorySource(root), runs);

	expect(report.refusals).toEqual([
		"agents/unreadable.md cannot be read, so its bytes cannot be hashed",
	]);
	expect(report.digest).toBeUndefined();
	expect(JSON.stringify(report.refusals)).not.toContain("EACCES");
	expect(report.files.map(({ path }) => path)).toContain(
		"skills/build/SKILL.md",
	);
}

async function verifyNamesASelfReferentialLinkAsARefusalThough(): Promise<void> {
	const root = await fullCorpusDirectory();
	await mkdir(join(root, "agents"), { recursive: true });
	await symlink(
		join(root, "agents", "loop.md"),
		join(root, "agents", "loop.md"),
	);
	const runs = await corpusDirectory();
	await new RecordedRunsFixture(runs).write();

	const report = await corpusReport(directorySource(root), runs);

	expect(report.refusals).toEqual([
		"agents/loop.md is a link that never resolves to a file, so it names no bytes",
	]);
	expect(report.digest).toBeUndefined();
	expect(JSON.stringify(report.refusals)).not.toContain("ELOOP");
}

async function verifyNamesBothAnUnreadableEntryAndAnEscapingOne(): Promise<void> {
	const root = await unreadableAgentCorpus("zz-unreadable.md");
	const outside = await corpusDirectory();
	await writeFile(join(outside, "secret.md"), "secret bytes\n");
	await symlink(join(outside, "secret.md"), join(root, "agents", "escape.md"));
	const runs = await corpusDirectory();
	await new RecordedRunsFixture(runs).write();

	const report = await corpusReport(directorySource(root), runs);

	expect(report.refusals).toEqual([
		"agents/escape.md resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
		"agents/zz-unreadable.md cannot be read, so its bytes cannot be hashed",
	]);
	expect(JSON.stringify(report.refusals)).not.toContain("EACCES");
}
