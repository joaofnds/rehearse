import { describe, expect, it } from "bun:test";

import { locateInDiff, spanInDiff } from "./evidence-locator";

const DIFF = [
	"diff --git a/src/app.ts b/src/app.ts",
	"index 696c215..0a72424 100644",
	"--- a/src/app.ts",
	"+++ b/src/app.ts",
	"@@ -1,2 +1,3 @@ export class App {",
	" import { Module } from './module';",
	"+import { AuditLog } from './audit-log';",
	" export class App {}",
	"@@ -30,1 +31,2 @@",
	" 	modules,",
	"+	AuditLog,",
	"diff --git a/src/old.ts b/src/old.ts",
	"deleted file mode 100644",
	"--- a/src/old.ts",
	"+++ /dev/null",
	"@@ -1 +0,0 @@",
	"-export const old = 1;",
].join("\n");
const everyFile = (): boolean => true;

function namesTheFileAndHunkOfAQuoteCopiedWithoutLinePrefixes(): void {
	const locator = locateInDiff(
		"import { Module } from './module';\nimport { AuditLog } from './audit-log';",
		DIFF,
		everyFile,
	);

	expect(locator).toEqual({
		file: "src/app.ts",
		hunk: "@@ -1,2 +1,3 @@",
		kind: "hunk",
		occurrences: 1,
	});
}

function findsAQuoteCopiedWithItsLinePrefixes(): void {
	const locator = locateInDiff("+\tAuditLog,", DIFF, everyFile);

	expect(locator).toMatchObject({
		file: "src/app.ts",
		hunk: "@@ -30,1 +31,2 @@",
	});
}

function namesADeletedFileByItsOldName(): void {
	const locator = locateInDiff("export const old = 1;", DIFF, everyFile);

	expect(locator).toMatchObject({
		file: "src/old.ts",
		hunk: "@@ -1 +0,0 @@",
	});
}

function namesTheHunkOfAQuoteThatStartsWithItsHeader(): void {
	const locator = locateInDiff(
		"@@ -30,1 +31,2 @@\n\tmodules,",
		DIFF,
		everyFile,
	);

	expect(locator).toEqual({
		file: "src/app.ts",
		hunk: "@@ -30,1 +31,2 @@",
		kind: "hunk",
		occurrences: 1,
	});
}

function findsAQuoteOfAHeaderLineWholeWithItsFunctionContext(): void {
	const locator = locateInDiff(
		"@@ -1,2 +1,3 @@ export class App {\nimport { Module } from './module';",
		DIFF,
		everyFile,
	);

	expect(locator).toEqual({
		file: "src/app.ts",
		hunk: "@@ -1,2 +1,3 @@",
		kind: "hunk",
		occurrences: 1,
	});
}

function namesTheHunkAQuoteSpanningHunksStartsIn(): void {
	const locator = locateInDiff(
		"export class App {}\n@@ -30,1 +31,2 @@\n\tmodules,",
		DIFF,
		everyFile,
	);

	expect(locator).toEqual({
		file: "src/app.ts",
		hunk: "@@ -1,2 +1,3 @@",
		kind: "hunk",
		occurrences: 1,
	});
}

function findsAQuoteRunningThroughAHeaderIntoAnAddedLineCopiedWithoutItsPrefix(): void {
	const locator = locateInDiff(
		"export class App {}\n@@ -30,1 +31,2 @@\n\tmodules,\n\tAuditLog,",
		DIFF,
		everyFile,
	);

	expect(locator).toMatchObject({ hunk: "@@ -1,2 +1,3 @@" });
}

function countsAQuoteInEveryHunkThatHoldsIt(): void {
	const locator = locateInDiff("AuditLog", DIFF, everyFile);

	expect(locator).toEqual({
		file: "src/app.ts",
		hunk: "@@ -1,2 +1,3 @@",
		kind: "hunk",
		occurrences: 2,
	});
}

function namesTheFirstHunkOfAQuoteThatStartsInTheFileSHeaderLines(): void {
	const locator = locateInDiff(
		"+++ b/src/app.ts\n@@ -1,2 +1,3 @@ export class App {",
		DIFF,
		everyFile,
	);

	expect(locator).toEqual({
		file: "src/app.ts",
		hunk: "@@ -1,2 +1,3 @@",
		kind: "hunk",
		occurrences: 1,
	});
}

function searchesOnlyTheFilesTheCitationNames(): void {
	const locator = locateInDiff(
		"export const old = 1;",
		DIFF,
		(file) => file === "src/app.ts",
	);

	expect(locator).toBeUndefined();
}

function givesTheRawRangeInTheWholeDiffOfAQuoteCopiedWithoutPrefixes(): void {
	const quote =
		"import { Module } from './module';\nimport { AuditLog } from './audit-log';";

	const span = spanInDiff(quote, DIFF, {
		file: "src/app.ts",
		hunk: "@@ -1,2 +1,3 @@",
	});

	expect(DIFF.slice(span?.start, span?.end)).toBe(
		"import { Module } from './module';\n+import { AuditLog } from './audit-log';",
	);
}

function givesTheRangeOfAQuoteCopiedWithItsPrefix(): void {
	const span = spanInDiff("+\tAuditLog,", DIFF, {
		file: "src/app.ts",
		hunk: "@@ -30,1 +31,2 @@",
	});

	expect(DIFF.slice(span?.start, span?.end)).toBe("+\tAuditLog,");
}

function givesTheRangeOfAQuoteSpanningHunksFromTheHunkItStartsIn(): void {
	const span = spanInDiff(
		"export class App {}\n@@ -30,1 +31,2 @@\n\tmodules,",
		DIFF,
		{ file: "src/app.ts", hunk: "@@ -1,2 +1,3 @@" },
	);

	expect(DIFF.slice(span?.start, span?.end)).toBe(
		"export class App {}\n@@ -30,1 +31,2 @@\n \tmodules,",
	);
}

function givesTheRangeOfAQuoteThatStartsInTheFileSHeaderLines(): void {
	const span = spanInDiff("deleted file mode 100644\n--- a/src/old.ts", DIFF, {
		file: "src/old.ts",
		hunk: "@@ -1 +0,0 @@",
	});

	expect(DIFF.slice(span?.start, span?.end)).toBe(
		"deleted file mode 100644\n--- a/src/old.ts",
	);
}

function findsNothingOutsideTheFileTheLocatorNames(): void {
	expect(
		spanInDiff("export const old = 1;", DIFF, {
			file: "src/app.ts",
			hunk: "@@ -1,2 +1,3 @@",
		}),
	).toBeUndefined();
}

describe(locateInDiff.name, () => {
	it(
		"names the file and hunk of a quote copied without line prefixes",
		namesTheFileAndHunkOfAQuoteCopiedWithoutLinePrefixes,
	);

	it(
		"finds a quote copied with its line prefixes",
		findsAQuoteCopiedWithItsLinePrefixes,
	);

	it("names a deleted file by its old name", namesADeletedFileByItsOldName);

	it(
		"names the hunk of a quote that starts with its header",
		namesTheHunkOfAQuoteThatStartsWithItsHeader,
	);

	it(
		"finds a quote of a header line whole with its function context",
		findsAQuoteOfAHeaderLineWholeWithItsFunctionContext,
	);

	it(
		"names the hunk a quote spanning hunks starts in",
		namesTheHunkAQuoteSpanningHunksStartsIn,
	);

	it(
		"finds a quote running through a header into an added line copied without its prefix",
		findsAQuoteRunningThroughAHeaderIntoAnAddedLineCopiedWithoutItsPrefix,
	);

	it(
		"counts a quote in every hunk that holds it",
		countsAQuoteInEveryHunkThatHoldsIt,
	);

	it(
		"names the first hunk of a quote that starts in the file's header lines",
		namesTheFirstHunkOfAQuoteThatStartsInTheFileSHeaderLines,
	);

	it(
		"searches only the files the citation names",
		searchesOnlyTheFilesTheCitationNames,
	);
});

describe(spanInDiff.name, () => {
	it(
		"gives the raw range in the whole diff of a quote copied without prefixes",
		givesTheRawRangeInTheWholeDiffOfAQuoteCopiedWithoutPrefixes,
	);

	it(
		"gives the range of a quote copied with its prefix",
		givesTheRangeOfAQuoteCopiedWithItsPrefix,
	);

	it(
		"gives the range of a quote spanning hunks from the hunk it starts in",
		givesTheRangeOfAQuoteSpanningHunksFromTheHunkItStartsIn,
	);

	it(
		"gives the range of a quote that starts in the file's header lines",
		givesTheRangeOfAQuoteThatStartsInTheFileSHeaderLines,
	);

	it(
		"finds nothing outside the file the locator names",
		findsNothingOutsideTheFileTheLocatorNames,
	);
});
