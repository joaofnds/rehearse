import { afterEach, describe, expect, it } from "bun:test";
import { writeFile } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { untouched } from "#server/corpus-edit-snapshot-test-fixture";
import { NO_VERSION } from "#server/corpus-edit-test-driver";
import {
	clearCorpusEditRoots,
	serving,
	servingEmptied,
	servingEscape,
} from "#server/corpus-edit-workspace-test-fixture";

afterEach(clearCorpusEditRoots);

async function verifyApiCorpusEditsWhenALayoutDirectoryHoldsALinkThatLeavesTheLinkedDirectoryRefusesTheReview(): Promise<void> {
	const { driver } = await servingEscape();

	const response = await driver.reviewRaw({
		path: "CLAUDE.md",
		startsFrom: NO_VERSION,
		text: "instructions, edited\n",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
}

async function verifyApiCorpusEditsWhenALayoutDirectoryHoldsALinkThatLeavesTheLinkedDirectoryRefusesTheApplyWritingNothingAndLoggingNoVersion(): Promise<void> {
	const served = await servingEscape();
	const before = await untouched(served);

	const response = await served.driver.applyRaw({
		path: "CLAUDE.md",
		startsFrom: NO_VERSION,
		text: "instructions, edited\n",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(await untouched(served)).toEqual(before);
}

async function verifyApiCorpusEditsWhenTheLinkedDirectoryIsNoLongerACorpusRefusesToOpenAFile(): Promise<void> {
	const { driver } = await servingEmptied();

	const response = await driver.openRaw("CLAUDE.md");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
}

async function verifyApiCorpusEditsWhenTheLinkedDirectoryIsNoLongerACorpusRefusesTheReview(): Promise<void> {
	const { driver } = await servingEmptied();

	const response = await driver.reviewRaw({
		path: "CLAUDE.md",
		startsFrom: NO_VERSION,
		text: "instructions, edited\n",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
}

async function verifyApiCorpusEditsWhenTheLinkedDirectoryIsNoLongerACorpusRefusesTheApply(): Promise<void> {
	const { driver } = await servingEmptied();

	const response = await driver.applyRaw({
		path: "CLAUDE.md",
		startsFrom: NO_VERSION,
		text: "instructions, edited\n",
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
}

describe("/api/corpus/edits", () => {
	describe("when the path is not a file the corpus report lists", () => {
		it.each([
			["a file the report does not list", "notes.md"],
			["a path outside the corpus", "../escape.md"],
			[
				"a path that climbs back to a listed file",
				"skills/build/../../CLAUDE.md",
			],
			["a layout directory", "skills"],
		])(
			"refuses the review and the apply of %s, writing nothing and logging no version",
			async (_situation, path) => {
				const served = await serving();
				await writeFile(join(served.corpus, "notes.md"), "notes\n");
				const edit = { path, text: "written from the browser\n" };
				const review = await served.driver.reviewRaw({
					...edit,
					startsFrom: NO_VERSION,
				});
				const before = await untouched(served);

				const response = await served.driver.applyRaw({
					...edit,
					startsFrom: NO_VERSION,
				});

				expect(review.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
				expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
				expect(await untouched(served)).toEqual(before);
			},
		);
	});
});

describe("/api/corpus/edits", () => {
	describe("when a layout directory holds a link that leaves the linked directory", () => {
		it(
			"refuses the review",
			verifyApiCorpusEditsWhenALayoutDirectoryHoldsALinkThatLeavesTheLinkedDirectoryRefusesTheReview,
		);

		it(
			"refuses the apply, writing nothing and logging no version",
			verifyApiCorpusEditsWhenALayoutDirectoryHoldsALinkThatLeavesTheLinkedDirectoryRefusesTheApplyWritingNothingAndLoggingNoVersion,
		);
	});
});

describe("/api/corpus/edits", () => {
	describe("when the linked directory is no longer a corpus", () => {
		it(
			"refuses to open a file",
			verifyApiCorpusEditsWhenTheLinkedDirectoryIsNoLongerACorpusRefusesToOpenAFile,
		);

		it(
			"refuses the review",
			verifyApiCorpusEditsWhenTheLinkedDirectoryIsNoLongerACorpusRefusesTheReview,
		);

		it(
			"refuses the apply",
			verifyApiCorpusEditsWhenTheLinkedDirectoryIsNoLongerACorpusRefusesTheApply,
		);
	});
});
