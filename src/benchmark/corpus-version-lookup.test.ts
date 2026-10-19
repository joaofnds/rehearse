import { describe, expect, it } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
	corpusVersionDigest,
	findCorpusVersion,
	measureCorpusVersion,
} from "./corpus-version";
import {
	COLLIDING_VERSION_PREFIX_CHARACTERS,
	CORPUS_VERSION_PREVIEW_CHARACTERS,
	PREFIX_START_INDEX,
	SHA256_HEX_DIGITS,
	createVersionWorkspace,
	versionDigest,
} from "./corpus-version-test-fixtures";

const { recordsDirectory, source } = createVersionWorkspace();

async function findsAVersionByAUniquePrefixOfItsDigestWithOrWithoutTheCorpusLabel(): Promise<void> {
	const digest = versionDigest(
		await measureCorpusVersion(recordsDirectory, source),
	);

	const found = await Promise.all([
		findCorpusVersion(
			recordsDirectory,
			digest.slice(PREFIX_START_INDEX, CORPUS_VERSION_PREVIEW_CHARACTERS),
		),
		findCorpusVersion(
			recordsDirectory,
			`corpus@${digest.slice(PREFIX_START_INDEX, CORPUS_VERSION_PREVIEW_CHARACTERS)}`,
		),
	]);

	expect(found).toEqual([
		{ digest, kind: "found" },
		{ digest, kind: "found" },
	]);
}

async function matchesNoVersionByAnEmptyPrefixEvenWhenOnlyOneIsRecorded(): Promise<void> {
	await measureCorpusVersion(recordsDirectory, source);

	const found = await Promise.all([
		findCorpusVersion(recordsDirectory, ""),
		findCorpusVersion(recordsDirectory, "corpus@"),
	]);

	expect(found).toEqual([{ kind: "missing" }, { kind: "missing" }]);
}

async function reportsAPrefixNoVersionStartsWithAsMissing(): Promise<void> {
	await measureCorpusVersion(recordsDirectory, source);

	expect(await findCorpusVersion(recordsDirectory, "corpus@zz")).toEqual({
		kind: "missing",
	});
}

async function namesEveryCandidateAPrefixSharedBySeveralVersionsMatches(): Promise<void> {
	const digests: string[] = [];
	await Array.fromAsync(
		Array.from({ length: 17 }, (_value, index) => index),
		async (edit) => {
			await writeFile(
				join(source.root, "output-styles", "brief.md"),
				`edit ${String(edit)}\n`,
			);
			digests.push(
				versionDigest(await measureCorpusVersion(recordsDirectory, source)),
			);
		},
	);
	const shared = digests.find((digest) =>
		digests.some(
			(other) =>
				other !== digest &&
				other.startsWith(
					digest.slice(PREFIX_START_INDEX, COLLIDING_VERSION_PREFIX_CHARACTERS),
				),
		),
	);
	const prefix =
		shared?.slice(PREFIX_START_INDEX, COLLIDING_VERSION_PREFIX_CHARACTERS) ??
		"";

	const found = await findCorpusVersion(recordsDirectory, prefix);

	expect(found).toEqual({
		candidates: digests
			.filter((digest) => digest.startsWith(prefix))
			.toSorted(),
		kind: "ambiguous",
	});
}

function changesWhenOneFileSHashChanges(): void {
	const before = corpusVersionDigest([
		{ path: "CLAUDE.md", sha256: "a".repeat(SHA256_HEX_DIGITS) },
	]);
	const after = corpusVersionDigest([
		{ path: "CLAUDE.md", sha256: "b".repeat(SHA256_HEX_DIGITS) },
	]);

	expect(after).not.toBe(before);
}

function isIndependentOfFileOrder(): void {
	const files = [
		{ path: "CLAUDE.md", sha256: "a".repeat(SHA256_HEX_DIGITS) },
		{ path: "skills/build.md", sha256: "b".repeat(SHA256_HEX_DIGITS) },
	];

	expect(corpusVersionDigest(files)).toBe(
		corpusVersionDigest(files.toReversed()),
	);
}

describe(findCorpusVersion.name, () => {
	it(
		"finds a version by a unique prefix of its digest, with or without the corpus@ label",
		findsAVersionByAUniquePrefixOfItsDigestWithOrWithoutTheCorpusLabel,
	);
	it(
		"matches no version by an empty prefix, even when only one is recorded",
		matchesNoVersionByAnEmptyPrefixEvenWhenOnlyOneIsRecorded,
	);
	it(
		"reports a prefix no version starts with as missing",
		reportsAPrefixNoVersionStartsWithAsMissing,
	);
	it(
		"names every candidate a prefix shared by several versions matches",
		namesEveryCandidateAPrefixSharedBySeveralVersionsMatches,
	);
});

describe(corpusVersionDigest.name, () => {
	it("changes when one file's hash changes", changesWhenOneFileSHashChanges);
	it("is independent of file order", isIndependentOfFileOrder);
});
