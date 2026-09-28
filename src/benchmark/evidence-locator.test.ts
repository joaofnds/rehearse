import { describe, expect, it } from "bun:test";
import {
	locateInCommitSubjects,
	locateInDiff,
	locateInExchanges,
	locateInFiles,
	spanInDiff,
} from "./evidence-locator";

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

describe(locateInFiles.name, () => {
	it("gives the line range of a quote whose whitespace differs from the source", () => {
		const files = [
			{
				file: "spec.md",
				text: "# Spec\n\nThe log records\n   every change.\n",
			},
		];

		const locator = locateInFiles("The log records every change.", files);

		expect(locator).toEqual({
			kind: "lines",
			file: "spec.md",
			startLine: 3,
			endLine: 4,
			occurrences: 1,
		});
	});

	it("names the first file holding the quote and counts it in every file", () => {
		const files = [
			{ file: "a.md", text: "nothing here" },
			{ file: "b.md", text: "one\nkeep it\nkeep it" },
			{ file: "c.md", text: "keep it" },
		];

		const locator = locateInFiles("keep it", files);

		expect(locator).toEqual({
			kind: "lines",
			file: "b.md",
			startLine: 2,
			endLine: 2,
			occurrences: 3,
		});
	});

	it.each(["absent text", "", "   "])(
		"finds nothing for the quote %p",
		(quote) => {
			expect(
				locateInFiles(quote, [{ file: "a.md", text: "some text" }]),
			).toBeUndefined();
		},
	);
});

describe(locateInDiff.name, () => {
	it("names the file and hunk of a quote copied without line prefixes", () => {
		const locator = locateInDiff(
			"import { Module } from './module';\nimport { AuditLog } from './audit-log';",
			DIFF,
			everyFile,
		);

		expect(locator).toEqual({
			kind: "hunk",
			file: "src/app.ts",
			hunk: "@@ -1,2 +1,3 @@",
			occurrences: 1,
		});
	});

	it("finds a quote copied with its line prefixes", () => {
		const locator = locateInDiff("+\tAuditLog,", DIFF, everyFile);

		expect(locator).toMatchObject({
			file: "src/app.ts",
			hunk: "@@ -30,1 +31,2 @@",
		});
	});

	it("names a deleted file by its old name", () => {
		const locator = locateInDiff("export const old = 1;", DIFF, everyFile);

		expect(locator).toMatchObject({
			file: "src/old.ts",
			hunk: "@@ -1 +0,0 @@",
		});
	});

	it("names the hunk of a quote that starts with its header", () => {
		const locator = locateInDiff(
			"@@ -30,1 +31,2 @@\n\tmodules,",
			DIFF,
			everyFile,
		);

		expect(locator).toEqual({
			kind: "hunk",
			file: "src/app.ts",
			hunk: "@@ -30,1 +31,2 @@",
			occurrences: 1,
		});
	});

	it("finds a quote of a header line whole with its function context", () => {
		const locator = locateInDiff(
			"@@ -1,2 +1,3 @@ export class App {\nimport { Module } from './module';",
			DIFF,
			everyFile,
		);

		expect(locator).toEqual({
			kind: "hunk",
			file: "src/app.ts",
			hunk: "@@ -1,2 +1,3 @@",
			occurrences: 1,
		});
	});

	it("names the hunk a quote spanning hunks starts in", () => {
		const locator = locateInDiff(
			"export class App {}\n@@ -30,1 +31,2 @@\n\tmodules,",
			DIFF,
			everyFile,
		);

		expect(locator).toEqual({
			kind: "hunk",
			file: "src/app.ts",
			hunk: "@@ -1,2 +1,3 @@",
			occurrences: 1,
		});
	});

	it("finds a quote running through a header into an added line copied without its prefix", () => {
		const locator = locateInDiff(
			"export class App {}\n@@ -30,1 +31,2 @@\n\tmodules,\n\tAuditLog,",
			DIFF,
			everyFile,
		);

		expect(locator).toMatchObject({ hunk: "@@ -1,2 +1,3 @@" });
	});

	it("counts a quote in every hunk that holds it", () => {
		const locator = locateInDiff("AuditLog", DIFF, everyFile);

		expect(locator).toEqual({
			kind: "hunk",
			file: "src/app.ts",
			hunk: "@@ -1,2 +1,3 @@",
			occurrences: 2,
		});
	});

	it("searches only the files the citation names", () => {
		const locator = locateInDiff(
			"export const old = 1;",
			DIFF,
			(file) => file === "src/app.ts",
		);

		expect(locator).toBeUndefined();
	});
});

describe(spanInDiff.name, () => {
	it("gives the raw range in the whole diff of a quote copied without prefixes", () => {
		const quote =
			"import { Module } from './module';\nimport { AuditLog } from './audit-log';";

		const span = spanInDiff(quote, DIFF, {
			file: "src/app.ts",
			hunk: "@@ -1,2 +1,3 @@",
		});

		expect(DIFF.slice(span?.start, span?.end)).toBe(
			"import { Module } from './module';\n+import { AuditLog } from './audit-log';",
		);
	});

	it("gives the range of a quote copied with its prefix", () => {
		const span = spanInDiff("+\tAuditLog,", DIFF, {
			file: "src/app.ts",
			hunk: "@@ -30,1 +31,2 @@",
		});

		expect(DIFF.slice(span?.start, span?.end)).toBe("+\tAuditLog,");
	});

	it("gives the range of a quote spanning hunks from the hunk it starts in", () => {
		const span = spanInDiff(
			"export class App {}\n@@ -30,1 +31,2 @@\n\tmodules,",
			DIFF,
			{ file: "src/app.ts", hunk: "@@ -1,2 +1,3 @@" },
		);

		expect(DIFF.slice(span?.start, span?.end)).toBe(
			"export class App {}\n@@ -30,1 +31,2 @@\n \tmodules,",
		);
	});

	it("finds nothing outside the file the locator names", () => {
		expect(
			spanInDiff("export const old = 1;", DIFF, {
				file: "src/app.ts",
				hunk: "@@ -1,2 +1,3 @@",
			}),
		).toBeUndefined();
	});
});

describe(locateInCommitSubjects.name, () => {
	it("gives the index of the subject holding the quote", () => {
		const locator = locateInCommitSubjects("persistence layer", [
			"feat(audit-log): add entity",
			"feat(audit-log): add persistence layer and migration",
		]);

		expect(locator).toEqual({ kind: "commit-subject", index: 1 });
	});

	it("gives the index of the subject a quote spanning subjects starts in", () => {
		const locator = locateInCommitSubjects(
			"feat(audit-log): add persistence layer\ntest(audit-log): cover",
			[
				"feat(audit-log): add entity",
				"feat(audit-log): add persistence layer",
				"test(audit-log): cover validation",
			],
		);

		expect(locator).toEqual({ kind: "commit-subject", index: 1 });
	});

	it("finds nothing for a quote joining subjects that are not consecutive", () => {
		const locator = locateInCommitSubjects("add entity\ncover validation", [
			"feat(audit-log): add entity",
			"feat(audit-log): add persistence layer",
			"test(audit-log): cover validation",
		]);

		expect(locator).toBeUndefined();
	});
});

describe(locateInExchanges.name, () => {
	it("gives the exchange, field and character range of the quote", () => {
		const exchanges = [
			{ agent: { status: "QUESTION" as const, message: "Which table?" } },
			{
				agent: { status: "QUESTION" as const, message: "Keep deletes?" },
				productOwnerAnswer: "Yes, keep  deletes forever.",
			},
		];

		const locator = locateInExchanges("keep deletes forever", exchanges);

		expect(locator).toEqual({
			kind: "exchange",
			exchange: 1,
			field: "productOwnerAnswer",
			start: 5,
			end: 26,
		});
	});
});
