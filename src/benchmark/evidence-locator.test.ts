import { describe, expect, it } from "bun:test";

import {
	locateInCommitSubjects,
	locateInExchanges,
	locateInFiles,
} from "./evidence-locator";

function givesTheLineRangeOfAQuoteWhoseWhitespaceDiffersFromTheSource(): void {
	const files = [
		{
			file: "spec.md",
			text: "# Spec\n\nThe log records\n   every change.\n",
		},
	];

	const locator = locateInFiles("The log records every change.", files);

	expect(locator).toEqual({
		endLine: 4,
		file: "spec.md",
		kind: "lines",
		occurrences: 1,
		startLine: 3,
	});
}

function namesTheFirstFileHoldingTheQuoteAndCountsItInEveryFile(): void {
	const files = [
		{ file: "a.md", text: "nothing here" },
		{ file: "b.md", text: "one\nkeep it\nkeep it" },
		{ file: "c.md", text: "keep it" },
	];

	const locator = locateInFiles("keep it", files);

	expect(locator).toEqual({
		endLine: 2,
		file: "b.md",
		kind: "lines",
		occurrences: 3,
		startLine: 2,
	});
}

function givesTheIndexOfTheSubjectHoldingTheQuote(): void {
	const locator = locateInCommitSubjects("persistence layer", [
		"feat(audit-log): add entity",
		"feat(audit-log): add persistence layer and migration",
	]);

	expect(locator).toEqual({ index: 1, kind: "commit-subject" });
}

function givesTheIndexOfTheSubjectAQuoteSpanningSubjectsStartsIn(): void {
	const locator = locateInCommitSubjects(
		"feat(audit-log): add persistence layer\ntest(audit-log): cover",
		[
			"feat(audit-log): add entity",
			"feat(audit-log): add persistence layer",
			"test(audit-log): cover validation",
		],
	);

	expect(locator).toEqual({ index: 1, kind: "commit-subject" });
}

function findsNothingForAQuoteJoiningSubjectsThatAreNotConsecutive(): void {
	const locator = locateInCommitSubjects("add entity\ncover validation", [
		"feat(audit-log): add entity",
		"feat(audit-log): add persistence layer",
		"test(audit-log): cover validation",
	]);

	expect(locator).toBeUndefined();
}

function givesTheExchangeFieldAndCharacterRangeOfTheQuote(): void {
	const exchanges = [
		{ agent: { message: "Which table?", status: "QUESTION" as const } },
		{
			agent: { message: "Keep deletes?", status: "QUESTION" as const },
			productOwnerAnswer: "Yes, keep  deletes forever.",
		},
	];

	const locator = locateInExchanges("keep deletes forever", exchanges);

	expect(locator).toEqual({
		end: 26,
		exchange: 1,
		field: "productOwnerAnswer",
		kind: "exchange",
		start: 5,
	});
}

describe(locateInFiles.name, () => {
	it(
		"gives the line range of a quote whose whitespace differs from the source",
		givesTheLineRangeOfAQuoteWhoseWhitespaceDiffersFromTheSource,
	);

	it(
		"names the first file holding the quote and counts it in every file",
		namesTheFirstFileHoldingTheQuoteAndCountsItInEveryFile,
	);

	it.each(["absent text", "", "   "])(
		"finds nothing for the quote %p",
		(quote) => {
			expect(
				locateInFiles(quote, [{ file: "a.md", text: "some text" }]),
			).toBeUndefined();
		},
	);
});

describe(locateInCommitSubjects.name, () => {
	it(
		"gives the index of the subject holding the quote",
		givesTheIndexOfTheSubjectHoldingTheQuote,
	);

	it(
		"gives the index of the subject a quote spanning subjects starts in",
		givesTheIndexOfTheSubjectAQuoteSpanningSubjectsStartsIn,
	);

	it(
		"finds nothing for a quote joining subjects that are not consecutive",
		findsNothingForAQuoteJoiningSubjectsThatAreNotConsecutive,
	);
});

describe(locateInExchanges.name, () => {
	it(
		"gives the exchange, field and character range of the quote",
		givesTheExchangeFieldAndCharacterRangeOfTheQuote,
	);
});
