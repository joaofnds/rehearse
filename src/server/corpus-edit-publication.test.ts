import { afterEach, describe, expect, it } from "bun:test";
import { chmod, lstat, mkdir, stat, writeFile } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { treeOf } from "#server/corpus-edit-snapshot-test-fixture";
import {
	clearCorpusEditRoots,
	editedFromDisk,
	linkedSkill,
	serving,
} from "#server/corpus-edit-workspace-test-fixture";

afterEach(clearCorpusEditRoots);

const PRESERVED_EXECUTABLE_MODE = 0o751;

const PERMISSION_OCTAL_DIGITS = 3;

const OCTAL_RADIX = 8;

async function verifyApiCorpusEditsAppliesTheReviewedEditAsANewVersionWhoseLastEditNamesTheVersionItStartedFromAndTheCountItReported(): Promise<void> {
	const { driver } = await serving();
	const edit = { path: "CLAUDE.md", text: "instructions, edited\n" };
	const review = await driver.review(edit);

	const applied = await driver.apply({
		...edit,
		startsFrom: review.startsFrom,
	});

	const corpus = await driver.corpus();
	expect(review).toMatchObject({ invalidated: 1 });
	expect(applied.previous).toBe(review.startsFrom);
	expect(corpus.digest).toBe(applied.version);
	expect(corpus.digest).not.toBe(review.startsFrom);
	expect(corpus.lastEdit).toMatchObject({
		count: review.invalidated,
		kind: "measured",
		previous: review.startsFrom,
	});
}

async function verifyApiCorpusEditsCountsNoStaleRowForAnEditToAFileNoJudgedStageRead(): Promise<void> {
	const { driver, corpus } = await serving();
	await mkdir(join(corpus, "skills", "unused"));
	await writeFile(join(corpus, "skills", "unused", "SKILL.md"), "unused\n");

	const review = await driver.review({
		path: "skills/unused/SKILL.md",
		text: "unused, edited\n",
	});

	expect(review).toMatchObject({ invalidated: 0 });
}

async function verifyApiCorpusEditsReportsNoApplyRefusalForALinkedDirectoryOutsideTheLiveInstall(): Promise<void> {
	const { driver } = await serving();

	const review = await driver.review({
		path: "CLAUDE.md",
		text: "instructions, edited\n",
	});

	expect(review.applyRefusal).toBeNull();
}

async function verifyApiCorpusEditsWritesTheEditedBytesOverTheFileWithItsMode(): Promise<void> {
	const { driver, corpus } = await serving();
	const file = join(corpus, "skills", "build", "SKILL.md");
	await chmod(file, PRESERVED_EXECUTABLE_MODE);
	const edit = { path: "skills/build/SKILL.md", text: "build, edited\n" };
	const review = await driver.review(edit);

	await driver.apply({ ...edit, startsFrom: review.startsFrom });

	const { mode } = await stat(file);
	expect(await Bun.file(file).text()).toBe("build, edited\n");
	expect(mode.toString(OCTAL_RADIX).slice(-PERMISSION_OCTAL_DIGITS)).toBe(
		"751",
	);
}

async function verifyApiCorpusEditsKeepsAStartingVersionNoMeasurementLoggedNamingItInTheLastEdit(): Promise<void> {
	const served = await serving();
	await editedFromDisk(served);
	const edit = { path: "CLAUDE.md", text: "instructions, edited\n" };
	const review = await served.driver.review(edit);

	await served.driver.apply({ ...edit, startsFrom: review.startsFrom });

	const startingVersion = await served.driver.version(review.startsFrom);
	const corpus = await served.driver.corpus();
	expect(startingVersion.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(corpus.lastEdit).toMatchObject({ previous: review.startsFrom });
}

async function verifyApiCorpusEditsRemovesNoRecord(): Promise<void> {
	const { driver, runsDirectory } = await serving();
	const recordsBefore = await treeOf(runsDirectory);
	const edit = { path: "CLAUDE.md", text: "instructions, edited\n" };
	const review = await driver.review(edit);

	await driver.apply({ ...edit, startsFrom: review.startsFrom });

	const recordsAfter = await treeOf(runsDirectory);
	expect(
		[...recordsBefore.keys()].filter((path) => !recordsAfter.has(path)),
	).toEqual([]);
}

async function verifyApiCorpusEditsLeavesNoFileInTheLinkedDirectoryBesideTheOnesItHeld(): Promise<void> {
	const { driver, corpus } = await serving();
	const edit = { path: "CLAUDE.md", text: "instructions, edited\n" };
	const review = await driver.review(edit);

	await driver.apply({ ...edit, startsFrom: review.startsFrom });

	const tree = await treeOf(corpus);
	expect([...tree.keys()].toSorted()).toEqual([
		"CLAUDE.md",
		join("skills", "build", "SKILL.md"),
		join("skills", "discuss", "SKILL.md"),
	]);
}

async function verifyApiCorpusEditsReplacesAFileThatIsALinkWhereItLivesLeavingTheLinkInPlace(): Promise<void> {
	const { driver, corpus } = await serving();
	const linked = await linkedSkill(corpus);
	const edit = { path: "skills/discuss/SKILL.md", text: "shared, edited\n" };
	const review = await driver.review(edit);

	await driver.apply({ ...edit, startsFrom: review.startsFrom });

	const link = await lstat(linked);
	expect(link.isSymbolicLink()).toBe(true);
	expect(
		await Bun.file(join(corpus, "skills", "shared", "SKILL.md")).text(),
	).toBe("shared, edited\n");
}

describe("/api/corpus/edits", () => {
	it(
		"applies the reviewed edit as a new version whose last edit names the version it started from and the count it reported",
		verifyApiCorpusEditsAppliesTheReviewedEditAsANewVersionWhoseLastEditNamesTheVersionItStartedFromAndTheCountItReported,
	);

	it(
		"counts no stale row for an edit to a file no judged stage read",
		verifyApiCorpusEditsCountsNoStaleRowForAnEditToAFileNoJudgedStageRead,
	);

	it(
		"reports no apply refusal for a linked directory outside the live install",
		verifyApiCorpusEditsReportsNoApplyRefusalForALinkedDirectoryOutsideTheLiveInstall,
	);

	it(
		"writes the edited bytes over the file with its mode",
		verifyApiCorpusEditsWritesTheEditedBytesOverTheFileWithItsMode,
	);

	it(
		"keeps a starting version no measurement logged, naming it in the last edit",
		verifyApiCorpusEditsKeepsAStartingVersionNoMeasurementLoggedNamingItInTheLastEdit,
	);

	it("removes no record", verifyApiCorpusEditsRemovesNoRecord);

	it(
		"leaves no file in the linked directory beside the ones it held",
		verifyApiCorpusEditsLeavesNoFileInTheLinkedDirectoryBesideTheOnesItHeld,
	);

	it(
		"replaces a file that is a link where it lives, leaving the link in place",
		verifyApiCorpusEditsReplacesAFileThatIsALinkWhereItLivesLeavingTheLinkInPlace,
	);
});
