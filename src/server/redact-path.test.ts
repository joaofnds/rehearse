import { afterEach, describe, expect, test } from "bun:test";
import { homedir } from "node:os";

import {
	clearRedactionRoots,
	messageFromReadingMissingFile,
	messageFromRenamingMissingFile,
} from "#server/redact-path-test-fixture";

import { redactAbsolutePaths, redactorFor } from "./redact-path";

afterEach(clearRedactionRoots);

describe(redactAbsolutePaths.name, registerRedactAbsolutePathsName);

function verifyReplacesAPOSIXAbsolutePathWithARedactionMarker(): void {
	const message = redactAbsolutePaths(
		"The build skill is not installed; searched /Users/joaofnds/.claude, /var/folders/x2/probe",
	);

	expect(message).toBe(
		"The build skill is not installed; searched <path>, <path>",
	);
}

function verifyLeavesAMessageWithNoAbsolutePathUnchanged(): void {
	expect(redactAbsolutePaths("no record run:x")).toBe("no record run:x");
}

function verifyRedactsAPathEmbeddedMidSentenceNotOnlyABarePath(): void {
	const message = redactAbsolutePaths(
		"No record run:no-such-run at /Users/joaofnds/code/rehearse/.benchmark-runs/x.json",
	);

	expect(message).toBe("No record run:no-such-run at <path>");
}

function verifyLeavesARelativeRecordIdSSlashSeparatedSegmentUntouched(): void {
	expect(
		redactAbsolutePaths(
			"checkpoint:2026-09-06T21-58-29.508Z/shape names a path outside the runs directory",
		),
	).toBe(
		"checkpoint:2026-09-06T21-58-29.508Z/shape names a path outside the runs directory",
	);
}

function verifyLeavesARelativeCorpusFilePathUntouched(): void {
	expect(
		redactAbsolutePaths("Corpus file skills/build/SKILL.md not found"),
	).toBe("Corpus file skills/build/SKILL.md not found");
}

function verifyRedactsAPathNodeQuotedInAnFsError(): void {
	expect(
		redactAbsolutePaths(
			"ENOENT: no such file or directory, open '/Users/joaofnds/secret.md'",
		),
	).toBe("ENOENT: no such file or directory, open '<path>'");
}

async function verifyRedactsARealFsErrorNamingAMissingFileUnderATempDirectory(): Promise<void> {
	const { message } = await messageFromReadingMissingFile("rehearse-redact-");

	expect(redactAbsolutePaths(message)).toBe(
		"ENOENT: no such file or directory, open '<path>'",
	);
}

async function verifyRedactsARealFsErrorUnderATempDirectoryWhoseNameContainsASpace(): Promise<void> {
	const { message } = await messageFromReadingMissingFile(
		"rehearse redact space ",
	);

	expect(redactAbsolutePaths(message)).toBe(
		"ENOENT: no such file or directory, open '<path>'",
	);
}

function verifyRedactsABareKnownRootThatFollowsNoWordBoundary(): void {
	expect(redactAbsolutePaths(`path=${homedir()}/a/secret.md`)).toBe(
		"path=<path>",
	);
}

function verifyRedactsAPathUnderAnUnknownRootThatNodeQuoted(): void {
	expect(redactAbsolutePaths("open '/srv/target-repo/x.md'")).toBe(
		"open '<path>'",
	);
}

function verifyRedactsAPathUnderAnUnknownRootThatFollowsAWordBoundary(): void {
	expect(redactAbsolutePaths("failed at /srv/target-repo/x.md")).toBe(
		"failed at <path>",
	);
}

async function verifyRedactsBothPathsOfARealTwoPathFsErrorClosingQuotesIntact(): Promise<void> {
	const message = await messageFromRenamingMissingFile();

	expect(redactAbsolutePaths(message)).toBe(
		"ENOENT: no such file or directory, rename '<path>' -> '<path>'",
	);
}

function verifyLeavesARelativeCaseDeclarationPathUntouched(): void {
	expect(redactAbsolutePaths("cases/act-1/case.json is malformed")).toBe(
		"cases/act-1/case.json is malformed",
	);
}

function verifyLeavesARelativeCorpusPathInARefusalUntouched(): void {
	expect(
		redactAbsolutePaths(
			"agents/escape.md resolves outside the tree it is named under",
		),
	).toBe("agents/escape.md resolves outside the tree it is named under");
}

async function verifyRemovesTheRootAndLeavesTheFragmentAfterTheApostrophe(): Promise<void> {
	const { message, root } = await messageFromReadingMissingFile(
		"rehearse-Bob's-redact-",
	);
	const tail = root.slice(root.indexOf("'"));

	expect(redactAbsolutePaths(message)).toBe(
		`ENOENT: no such file or directory, open '<path>${tail}/secret.md'`,
	);
}

function verifyLeavesARelativeCorpusPathAloneWhenARootIsTheFilesystemRoot(): void {
	const redact = redactorFor(["/", "/var/folders/x2/T"]);

	expect(redact("Corpus file skills/build/SKILL.md not found")).toBe(
		"Corpus file skills/build/SKILL.md not found",
	);
}

function verifyLeavesARelativeCorpusPathAloneWhenARootIsEmpty(): void {
	const redact = redactorFor(["", "/var/folders/x2/T"]);

	expect(redact("Corpus file skills/build/SKILL.md not found")).toBe(
		"Corpus file skills/build/SKILL.md not found",
	);
}

function verifyStillRedactsAnAbsolutePathWhenEveryRootIsDegenerate(): void {
	const redact = redactorFor(["/", ""]);

	expect(redact("open '/srv/target-repo/secret.md'")).toBe("open '<path>'");
}

function registerRedactAbsolutePathsNameMessagesAndRelativeIdentities(): void {
	test(
		"replaces a POSIX absolute path with a redaction marker",
		verifyReplacesAPOSIXAbsolutePathWithARedactionMarker,
	);

	test(
		"leaves a message with no absolute path unchanged",
		verifyLeavesAMessageWithNoAbsolutePathUnchanged,
	);

	test(
		"redacts a path embedded mid-sentence, not only a bare path",
		verifyRedactsAPathEmbeddedMidSentenceNotOnlyABarePath,
	);

	test(
		"leaves a relative record id's slash-separated segment untouched",
		verifyLeavesARelativeRecordIdSSlashSeparatedSegmentUntouched,
	);

	test(
		"leaves a relative corpus file path untouched",
		verifyLeavesARelativeCorpusFilePathUntouched,
	);
}

function registerRedactAbsolutePathsNameFilesystemPaths(): void {
	test(
		"redacts a path Node quoted in an fs error",
		verifyRedactsAPathNodeQuotedInAnFsError,
	);

	test(
		"redacts a real fs error naming a missing file under a temp directory",
		verifyRedactsARealFsErrorNamingAMissingFileUnderATempDirectory,
	);

	test(
		"redacts a real fs error under a temp directory whose name contains a space",
		verifyRedactsARealFsErrorUnderATempDirectoryWhoseNameContainsASpace,
	);

	test(
		"redacts a bare known root that follows no word boundary",
		verifyRedactsABareKnownRootThatFollowsNoWordBoundary,
	);

	test(
		"redacts a path under an unknown root that Node quoted",
		verifyRedactsAPathUnderAnUnknownRootThatNodeQuoted,
	);

	test(
		"redacts a path under an unknown root that follows a word boundary",
		verifyRedactsAPathUnderAnUnknownRootThatFollowsAWordBoundary,
	);

	test(
		"redacts both paths of a real two-path fs error, closing quotes intact",
		verifyRedactsBothPathsOfARealTwoPathFsErrorClosingQuotesIntact,
	);
}

function registerRedactAbsolutePathsNameRelativeDeclarationPaths(): void {
	test(
		"leaves a relative case declaration path untouched",
		verifyLeavesARelativeCaseDeclarationPathUntouched,
	);

	test(
		"leaves a relative corpus path in a refusal untouched",
		verifyLeavesARelativeCorpusPathInARefusalUntouched,
	);
}

function registerRedactAbsolutePathsNameWhenADirectoryInThePathIsNamedWithAnApostrophe(): void {
	test(
		"removes the root and leaves the fragment after the apostrophe",
		verifyRemovesTheRootAndLeavesTheFragmentAfterTheApostrophe,
	);
}

function registerRedactAbsolutePathsNameUnderADegenerateRootTheProcessReports(): void {
	test(
		"leaves a relative corpus path alone when a root is the filesystem root",
		verifyLeavesARelativeCorpusPathAloneWhenARootIsTheFilesystemRoot,
	);

	test(
		"leaves a relative corpus path alone when a root is empty",
		verifyLeavesARelativeCorpusPathAloneWhenARootIsEmpty,
	);

	test(
		"still redacts an absolute path when every root is degenerate",
		verifyStillRedactsAnAbsolutePathWhenEveryRootIsDegenerate,
	);
}

function registerRedactAbsolutePathsName(): void {
	describe(
		"messages and relative identities",
		registerRedactAbsolutePathsNameMessagesAndRelativeIdentities,
	);
	describe("filesystem paths", registerRedactAbsolutePathsNameFilesystemPaths);
	describe(
		"relative declaration paths",
		registerRedactAbsolutePathsNameRelativeDeclarationPaths,
	);
	describe(
		"when a directory in the path is named with an apostrophe",
		registerRedactAbsolutePathsNameWhenADirectoryInThePathIsNamedWithAnApostrophe,
	);

	describe(
		"under a degenerate root the process reports",
		registerRedactAbsolutePathsNameUnderADegenerateRootTheProcessReports,
	);
}
