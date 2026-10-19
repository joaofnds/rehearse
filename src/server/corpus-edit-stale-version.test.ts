import { afterEach, describe, expect, it } from "bun:test";
import { writeFile } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { untouched } from "#server/corpus-edit-snapshot-test-fixture";
import {
	clearCorpusEditRoots,
	editedFromDisk,
	serving,
} from "#server/corpus-edit-workspace-test-fixture";

afterEach(clearCorpusEditRoots);

async function verifyApiCorpusEditsWhenTheLinkedDirectoryNoLongerHoldsTheVersionTheEditStartedFromRefusesTheApplyWritingNothingAndLoggingNoVersion(): Promise<void> {
	const served = await serving();
	const edit = { path: "CLAUDE.md", text: "instructions, edited\n" };
	const review = await served.driver.review(edit);
	await editedFromDisk(served);
	const before = await untouched(served);

	const response = await served.driver.applyRaw({
		...edit,
		startsFrom: review.startsFrom,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(await response.text()).toContain(review.startsFrom);
	expect(await untouched(served)).toEqual(before);
}

async function verifyApiCorpusEditsWhenTheLinkedDirectoryChangedAfterTheFileWasOpenedRefusesTheReviewSinceTheEditWouldOverwriteTheChangeUnseen(): Promise<void> {
	const served = await serving();
	const opened = await served.driver.opened("CLAUDE.md");
	await writeFile(
		join(served.corpus, "CLAUDE.md"),
		"changed in another editor\n",
	);

	const response = await served.driver.reviewRaw({
		path: "CLAUDE.md",
		startsFrom: opened,
		text: "instructions, edited\n",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(await response.text()).toContain("Open the file again");
}

async function verifyApiCorpusEditsWhenTheEditLeavesTheFileSBytesUnchangedRefusesTheApplyWritingNothingAndLoggingNoVersion(): Promise<void> {
	const served = await serving();
	const edit = { path: "CLAUDE.md", text: "instructions\n" };
	const review = await served.driver.review(edit);
	const before = await untouched(served);

	const response = await served.driver.applyRaw({
		...edit,
		startsFrom: review.startsFrom,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(await untouched(served)).toEqual(before);
}

describe("/api/corpus/edits", () => {
	describe(
		"when the linked directory no longer holds the version the edit started from",
		registerCorpusEditStaleVersionWhenTheLinkedDirectoryNoLongerHoldsTheVersionTheEditStartedFrom,
	);

	describe(
		"when the linked directory changed after the file was opened",
		registerCorpusEditStaleVersionWhenTheLinkedDirectoryChangedAfterTheFileWasOpened,
	);

	describe(
		"when the edit leaves the file's bytes unchanged",
		registerCorpusEditStaleVersionWhenTheEditLeavesTheFileSBytesUnchanged,
	);
});

function registerCorpusEditStaleVersionWhenTheLinkedDirectoryNoLongerHoldsTheVersionTheEditStartedFrom(): void {
	it(
		"refuses the apply, writing nothing and logging no version",
		verifyApiCorpusEditsWhenTheLinkedDirectoryNoLongerHoldsTheVersionTheEditStartedFromRefusesTheApplyWritingNothingAndLoggingNoVersion,
	);
}

function registerCorpusEditStaleVersionWhenTheLinkedDirectoryChangedAfterTheFileWasOpened(): void {
	it(
		"refuses the review, since the edit would overwrite the change unseen",
		verifyApiCorpusEditsWhenTheLinkedDirectoryChangedAfterTheFileWasOpenedRefusesTheReviewSinceTheEditWouldOverwriteTheChangeUnseen,
	);
}

function registerCorpusEditStaleVersionWhenTheEditLeavesTheFileSBytesUnchanged(): void {
	it(
		"refuses the apply, writing nothing and logging no version",
		verifyApiCorpusEditsWhenTheEditLeavesTheFileSBytesUnchangedRefusesTheApplyWritingNothingAndLoggingNoVersion,
	);
}
