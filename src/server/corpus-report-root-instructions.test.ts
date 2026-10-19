import { afterEach, describe, expect, it } from "bun:test";
import { chmod, mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { directorySource } from "#benchmark/run-records-test-support";
import {
	clearCorpusReportRoots,
	corpusDirectory,
	runsDirectory,
} from "#server/corpus-report-workspace-test-fixture";
import { INACCESSIBLE_PERMISSIONS } from "#server/file-permissions-test-support";

import { corpusReport } from "./corpus-report";

afterEach(clearCorpusReportRoots);

describe(corpusReport.name, () => {
	it(
		"refuses a corpus root whose CLAUDE.md is a symlink to a file outside it, naming it rather than throwing",
		verifyRefusesACorpusRootWhoseCLAUDEMdIsA,
	);

	it(
		"refuses a CLAUDE.md whose link target is gone, rather than reporting the corpus as one that has none",
		verifyRefusesACLAUDEMdWhoseLinkTargetIsGone,
	);

	it(
		"refuses a CLAUDE.md the harness cannot read, naming it rather than failing the screen",
		verifyRefusesACLAUDEMdTheHarnessCannotReadNaming,
	);

	it(
		"refuses a CLAUDE.md that is a device rather than a file, since a device holds no corpus bytes",
		verifyRefusesACLAUDEMdThatIsADeviceRather,
	);

	it(
		"refuses a CLAUDE.md that is a pipe, rather than blocking the request on a reader that never returns",
		verifyRefusesACLAUDEMdThatIsAPipeRather,
	);

	it(
		"refuses a CLAUDE.md that points at itself, rather than failing the screen with the loop error",
		verifyRefusesACLAUDEMdThatPointsAtItselfRather,
	);

	it(
		"refuses a CLAUDE.md that is a symlink to a directory, since a directory holds no instruction bytes",
		verifyRefusesACLAUDEMdThatIsASymlinkTo,
	);

	it(
		"reports no refusal for a corpus root that simply has no CLAUDE.md",
		verifyReportsNoRefusalForACorpusRootThatSimply,
	);
});

async function verifyRefusesACorpusRootWhoseCLAUDEMdIsA(): Promise<void> {
	const root = await corpusDirectory();
	const outside = await corpusDirectory();
	await writeFile(join(outside, "secret.md"), "SECRET BYTES\n");
	await symlink(join(outside, "secret.md"), join(root, "CLAUDE.md"));
	const runs = await runsDirectory();

	const report = await corpusReport(directorySource(root), runs);

	expect(report.refusals).toEqual([
		"Corpus file CLAUDE.md resolves outside the corpus source, which would hash bytes the corpus does not hold",
	]);
	expect(report.digest).toBeUndefined();
	expect(JSON.stringify(report)).not.toContain("SECRET BYTES");
}

async function verifyRefusesACLAUDEMdWhoseLinkTargetIsGone(): Promise<void> {
	const root = await corpusDirectory();
	await symlink(join(root, "does-not-exist.md"), join(root, "CLAUDE.md"));
	const runs = await runsDirectory();

	const report = await corpusReport(directorySource(root), runs);

	expect(report.refusals).toEqual([
		"Corpus file CLAUDE.md is a link whose target is missing, so the bytes it names cannot be read",
	]);
	expect(report.digest).toBeUndefined();
}

async function verifyRefusesACLAUDEMdTheHarnessCannotReadNaming(): Promise<void> {
	const root = await corpusDirectory();
	await writeFile(join(root, "CLAUDE.md"), "instructions\n");
	await chmod(join(root, "CLAUDE.md"), INACCESSIBLE_PERMISSIONS);
	const runs = await runsDirectory();

	const report = await corpusReport(directorySource(root), runs);

	expect(report.refusals).toEqual([
		"Corpus file CLAUDE.md cannot be read, so its bytes cannot be hashed",
	]);
	expect(report.digest).toBeUndefined();
}

async function verifyRefusesACLAUDEMdThatIsADeviceRather(): Promise<void> {
	const root = await corpusDirectory();
	await symlink("/dev/null", join(root, "CLAUDE.md"));
	const runs = await runsDirectory();

	const report = await corpusReport(directorySource(root), runs);

	expect(report.refusals).toEqual([
		"Corpus file CLAUDE.md is not a regular file, so it holds no bytes to hash",
	]);
	expect(report.digest).toBeUndefined();
}

async function verifyRefusesACLAUDEMdThatIsAPipeRather(): Promise<void> {
	const root = await corpusDirectory();
	await Bun.spawn(["mkfifo", join(root, "CLAUDE.md")]).exited;
	const runs = await runsDirectory();

	const report = await corpusReport(directorySource(root), runs);

	expect(report.refusals).toEqual([
		"Corpus file CLAUDE.md is not a regular file, so it holds no bytes to hash",
	]);
	expect(report.digest).toBeUndefined();
}

async function verifyRefusesACLAUDEMdThatPointsAtItselfRather(): Promise<void> {
	const root = await corpusDirectory();
	await symlink(join(root, "CLAUDE.md"), join(root, "CLAUDE.md"));
	const runs = await runsDirectory();

	const report = await corpusReport(directorySource(root), runs);

	expect(report.refusals).toEqual([
		"Corpus file CLAUDE.md is a link that never resolves to a file, so it names no bytes",
	]);
	expect(report.digest).toBeUndefined();
}

async function verifyRefusesACLAUDEMdThatIsASymlinkTo(): Promise<void> {
	const root = await corpusDirectory();
	const outside = await corpusDirectory();
	await writeFile(join(outside, "secret.md"), "SECRET BYTES\n");
	await symlink(outside, join(root, "CLAUDE.md"));
	const runs = await runsDirectory();

	const report = await corpusReport(directorySource(root), runs);

	expect(report.refusals).toEqual([
		"Corpus file CLAUDE.md is a directory, so it holds no bytes to hash",
	]);
	expect(report.digest).toBeUndefined();
}

async function verifyReportsNoRefusalForACorpusRootThatSimply(): Promise<void> {
	const root = await corpusDirectory();
	await mkdir(join(root, "skills", "build"), { recursive: true });
	await writeFile(join(root, "skills", "build", "SKILL.md"), "a skill\n");

	const report = await corpusReport(
		directorySource(root),
		await runsDirectory(),
	);

	expect(report.refusals).toEqual([]);
	expect(report.files.map(({ path }) => path)).toEqual([
		"skills/build/SKILL.md",
	]);
}
