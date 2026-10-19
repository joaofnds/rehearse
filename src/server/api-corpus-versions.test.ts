import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { z } from "zod";

import type { CorpusRoot } from "#benchmark/corpus-file";
import { measureCorpusVersion } from "#benchmark/corpus-version";
import { directorySource } from "#benchmark/run-records-test-support";
import { ApiTestWorkspace, apiTestApp } from "#server/api-test-workspace";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

const FIRST_VERSION_INDEX = 0;

const SECOND_VERSION_INDEX = 1;

const SHORT_DIGEST_PREVIEW_CHARACTERS = 6;

const LONG_DIGEST_PREVIEW_CHARACTERS = 12;

const INITIAL_VERSION_POSITION = 1;

const FOLLOWING_VERSION_POSITION = 2;

const PREFIX_START_INDEX = 0;

const corpusVersionSchema = z.object({
	digest: z.string(),
	label: z.string(),
	position: z.number(),
});

const workspace = new ApiTestWorkspace();

afterEach(async () => {
	await workspace.dispose();
});

function sha256Hex(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

async function measuredTwice(): Promise<{
	readonly app: ReturnType<typeof apiTestApp>;
	readonly older: string;
}> {
	const corpus = await workspace.corpusDirectory();
	const runsDirectory = await workspace.emptyDirectory("rehearse-api-runs-");
	const source = directorySource(corpus);
	const older = await measureCorpusVersion(runsDirectory, source);
	await Bun.write(join(corpus, "CLAUDE.md"), "edited instructions 3\n");
	await measureCorpusVersion(runsDirectory, source);
	if (older.kind !== "version") {
		throw new Error("the fixture corpus should measure to a version");
	}

	return {
		app: apiTestApp(runsDirectory, source),
		older: older.digest,
	};
}

async function measuredDigest(
	runsDirectory: string,
	source: CorpusRoot,
): Promise<string> {
	const measured = await measureCorpusVersion(runsDirectory, source);
	if (measured.kind !== "version") {
		throw new Error("the fixture corpus should measure to a version");
	}

	return measured.digest;
}

describe("GET /api/corpus/versions", () => {
	it(
		"lists the corpus under test's versions in log order, each named corpus@ and six characters",
		verifyListsTheCorpusUnderTestSVersionsInLog,
	);

	it(
		"opens the older version's file by a unique prefix after the source file changed",
		verifyOpensTheOlderVersionSFileByAUnique,
	);

	it(
		"refuses an ambiguous prefix and names its candidates",
		verifyRefusesAnAmbiguousPrefixAndNamesItsCandidates,
	);

	it(
		"opens a version by a unique prefix as its digest, label and files",
		verifyOpensAVersionByAUniquePrefixAsIts,
	);

	it(
		"serves a version's file as the bytes it held, text or not",
		verifyServesAVersionSFileAsTheBytesIt,
	);

	it(
		"answers a file request that names no path as a bad request",
		verifyAnswersAFileRequestThatNamesNoPathAs,
	);

	it(
		"refuses a version no record holds and a file the version does not hold",
		verifyRefusesAVersionNoRecordHoldsAndAFile,
	);
});

async function verifyListsTheCorpusUnderTestSVersionsInLog(): Promise<void> {
	const { app, older } = await measuredTwice();

	const response = await app.read("/api/corpus/versions");
	const body = z
		.object({
			versions: z.array(corpusVersionSchema),
		})
		.parse(await response.json());

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(body.versions.map(({ position }) => position)).toEqual([
		INITIAL_VERSION_POSITION,
		FOLLOWING_VERSION_POSITION,
	]);
	expect(body.versions[FIRST_VERSION_INDEX]).toEqual({
		digest: older,
		label: `corpus@${older.slice(PREFIX_START_INDEX, SHORT_DIGEST_PREVIEW_CHARACTERS)}`,
		position: 1,
	});
	expect(body.versions[SECOND_VERSION_INDEX]?.digest).not.toBe(older);
}

async function verifyOpensTheOlderVersionSFileByAUnique(): Promise<void> {
	const { app, older } = await measuredTwice();

	const response = await app.corpusVersionFile({
		path: "CLAUDE.md",
		prefix: `corpus@${older.slice(PREFIX_START_INDEX, LONG_DIGEST_PREVIEW_CHARACTERS)}`,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.text()).toBe("the instructions\n");
}

async function verifyRefusesAnAmbiguousPrefixAndNamesItsCandidates(): Promise<void> {
	const { app } = await measuredTwice();

	// Both versions of this fixed tree start with "4".
	const response = await app.corpusVersion("corpus@4");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(await response.json()).toEqual({
		candidates: [
			"4821f98acb79d83b1eddd201252732a1b8ddc996ca6eee8aedcf348cb988a326",
			"49a9e463aae61c91d06da870b9c0d74822ac5ca1696bc8148806467c0356774a",
		],
		error: "The corpus version prefix is ambiguous",
	});
}

async function verifyOpensAVersionByAUniquePrefixAsIts(): Promise<void> {
	const { app, older } = await measuredTwice();

	const response = await app.corpusVersion(
		older.slice(PREFIX_START_INDEX, SHORT_DIGEST_PREVIEW_CHARACTERS),
	);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toEqual({
		digest: older,
		files: [
			{ path: "CLAUDE.md", sha256: sha256Hex("the instructions\n") },
			{ path: "skills/build/SKILL.md", sha256: sha256Hex("build skill\n") },
			{
				path: "skills/discuss/SKILL.md",
				sha256: sha256Hex("discuss skill\n"),
			},
		],
		label: `corpus@${older.slice(PREFIX_START_INDEX, SHORT_DIGEST_PREVIEW_CHARACTERS)}`,
	});
}

async function verifyServesAVersionSFileAsTheBytesIt(): Promise<void> {
	const corpus = await workspace.corpusDirectory();
	const runsDirectory = await workspace.emptyDirectory("rehearse-api-runs-");
	const source = directorySource(corpus);
	const bytes = new Uint8Array(Buffer.from("fffe0001", "hex"));
	await Bun.write(join(corpus, "skills", "build", "table.bin"), bytes);
	const digest = await measuredDigest(runsDirectory, source);
	const app = apiTestApp(runsDirectory, source);

	const response = await app.corpusVersionFile({
		path: "skills/build/table.bin",
		prefix: digest,
	});

	expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
}

async function verifyAnswersAFileRequestThatNamesNoPathAs(): Promise<void> {
	const { app, older } = await measuredTwice();

	const response = await app.corpusVersionFile({ prefix: older });

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
}

async function verifyRefusesAVersionNoRecordHoldsAndAFile(): Promise<void> {
	const { app, older } = await measuredTwice();

	const missing = await app.corpusVersion("f".repeat(SHA256_HEX_DIGITS));
	const absentFile = await app.corpusVersionFile({
		path: "agents/none.md",
		prefix: older,
	});

	expect(missing.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
	expect(absentFile.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
}
