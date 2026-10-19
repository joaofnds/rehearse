import { afterEach, describe, expect, it } from "bun:test";
import {
	chmod,
	mkdir,
	mkdtemp,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { directorySource } from "#benchmark/run-records-test-support";
import { ApiTestWorkspace } from "#server/api-test-workspace";
import { INACCESSIBLE_PERMISSIONS } from "#server/file-permissions-test-support";

const SINGLE_MATCH_COUNT = 1;

const FIRST_REFUSAL_INDEX = 0;

const workspace = new ApiTestWorkspace();

afterEach(async () => {
	await workspace.dispose();
});

interface EscapingCorpus {
	readonly corpus: string;
	readonly outside: string;
	readonly backingRoot: string;
}

async function escapingLayoutCorpus(): Promise<EscapingCorpus> {
	const corpus = await workspace.corpusDirectory();
	const outside = await workspace.emptyDirectory("private-corpus-target-");
	const backingRoot = await workspace.emptyDirectory("rehearse-backing-");
	await writeFile(join(outside, "hidden-descendant.md"), "private contents");
	await symlink(outside, join(corpus, "agents"));

	return { backingRoot, corpus, outside };
}

async function escapingInstructionCorpus(): Promise<EscapingCorpus> {
	const corpus = await workspace.corpusDirectory();
	const backingRoot = await workspace.emptyDirectory("rehearse-api-backing-");
	const outside = await workspace.emptyDirectory("rehearse-api-outside-");
	await rm(join(corpus, "CLAUDE.md"));
	await writeFile(join(outside, "secret.md"), "SECRET BYTES\n");
	await symlink(join(outside, "secret.md"), join(corpus, "CLAUDE.md"));

	return { backingRoot, corpus, outside };
}

const REFUSED_CORPUS_PATHS = [
	[
		"a self-referential directory",
		async (path: string) => {
			await symlink(path, path);
		},
		"agents is a link that never resolves to a file, so it names no bytes",
	],
	[
		"a regular file",
		async (path: string) => {
			await writeFile(path, "not a directory\n");
		},
		"agents is not a directory, so it cannot contain corpus files to hash",
	],
] as const;

describe("GET /api/corpus", () => {
	it(
		"refuses an escaping live layout root without revealing its target or descendants",
		verifyRefusesAnEscapingLiveLayoutRootWithoutRevealingIts,
	);

	it(
		"renders the corpus root unredacted, since the operator declared it and the server is theirs",
		verifyRendersTheCorpusRootUnredactedSinceTheOperatorDeclared,
	);

	it(
		"serves the files it could hash and names the refusal, rather than failing the screen over one entry",
		verifyServesTheFilesItCouldHashAndNamesThe,
	);

	it(
		"names CLAUDE.md as a refusal when it is itself a link out of the tree, rather than failing the screen",
		verifyNamesCLAUDEMdAsARefusalWhenItIs,
	);

	it(
		"names an unreadable layout entry as a refusal, rather than failing the screen",
		verifyNamesAnUnreadableLayoutEntryAsARefusalRather,
	);

	it(
		"names a self-referential layout entry as a refusal, rather than failing the screen",
		verifyNamesASelfReferentialLayoutEntryAsARefusal,
	);

	it.each(REFUSED_CORPUS_PATHS)(
		"names %s at a top-level layout path as a refusal, rather than returning 500",
		verifyRefusedCorpusPaths,
	);

	it(
		"serves a live corpus with an out-of-extent instruction file as a partial report",
		verifyServesALiveCorpusWithAnOutOfExtent,
	);
});

async function verifyRefusesAnEscapingLiveLayoutRootWithoutRevealingIts(): Promise<void> {
	const { corpus, outside, backingRoot } = await escapingLayoutCorpus();

	const { response, text, body } = await workspace.corpusResponse({
		backingRoot,
		kind: "live",
		root: corpus,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);

	expect(body.digest).toBeUndefined();
	expect(body.refusals).toHaveLength(SINGLE_MATCH_COUNT);
	expect(body.refusals[FIRST_REFUSAL_INDEX]).toContain("agents");
	expect(body.files.map(({ path }) => path)).toEqual([
		"CLAUDE.md",
		"skills/build/SKILL.md",
		"skills/discuss/SKILL.md",
	]);
	expect(text).not.toContain(outside);
	expect(text).not.toContain("hidden-descendant.md");
	expect(text).not.toContain("private contents");
}

async function verifyRendersTheCorpusRootUnredactedSinceTheOperatorDeclared(): Promise<void> {
	const corpus = await workspace.corpusDirectory();
	const runsDirectory = await mkdtemp(join(tmpdir(), "rehearse-api-runs-"));
	workspace.track(runsDirectory);

	const { response, body } = await workspace.corpusResponse(
		directorySource(corpus),
	);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(body).toMatchObject({ root: corpus });
}

async function verifyServesTheFilesItCouldHashAndNamesThe(): Promise<void> {
	const corpus = await workspace.corpusDirectory();
	const outside = await workspace.emptyDirectory("rehearse-api-outside-");
	await writeFile(join(outside, "secret.md"), "secret bytes\n");
	await mkdir(join(corpus, "agents"), { recursive: true });
	await symlink(
		join(outside, "secret.md"),
		join(corpus, "agents", "escape.md"),
	);

	const { response, body } = await workspace.corpusResponse(
		directorySource(corpus),
	);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(body.files.map(({ path }) => path)).toEqual([
		"CLAUDE.md",
		"skills/build/SKILL.md",
		"skills/discuss/SKILL.md",
	]);
	expect(body.refusals).toEqual([
		"agents/escape.md resolves outside the tree it is named under, so its bytes are not the ones that tree holds",
	]);
	expect(body.digest).toBeUndefined();
}

async function verifyNamesCLAUDEMdAsARefusalWhenItIs(): Promise<void> {
	const corpus = await workspace.emptyDirectory("rehearse-api-corpus-");
	const outside = await workspace.emptyDirectory("rehearse-api-outside-");
	await writeFile(join(outside, "secret.md"), "secret bytes\n");
	await symlink(join(outside, "secret.md"), join(corpus, "CLAUDE.md"));

	const { response, body } = await workspace.corpusResponse(
		directorySource(corpus),
	);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(body.refusals).toEqual([
		"Corpus file CLAUDE.md resolves outside the corpus source, which would hash bytes the corpus does not hold",
	]);
	expect(body.files).toEqual([]);
	expect(body.digest).toBeUndefined();
}

async function verifyNamesAnUnreadableLayoutEntryAsARefusalRather(): Promise<void> {
	const corpus = await workspace.corpusDirectory();
	await mkdir(join(corpus, "agents"), { recursive: true });
	await writeFile(join(corpus, "agents", "private.md"), "an agent\n");
	await chmod(join(corpus, "agents", "private.md"), INACCESSIBLE_PERMISSIONS);

	const { response, text, body } = await workspace.corpusResponse(
		directorySource(corpus),
	);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(body.refusals).toEqual([
		"agents/private.md cannot be read, so its bytes cannot be hashed",
	]);
	expect(body.digest).toBeUndefined();
	expect(text).not.toContain("EACCES");
	expect(body.refusals.join("")).not.toContain(corpus);
}

async function verifyNamesASelfReferentialLayoutEntryAsARefusal(): Promise<void> {
	const corpus = await workspace.corpusDirectory();
	await mkdir(join(corpus, "agents"), { recursive: true });
	await symlink(
		join(corpus, "agents", "loop.md"),
		join(corpus, "agents", "loop.md"),
	);

	const { response, text, body } = await workspace.corpusResponse(
		directorySource(corpus),
	);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(body.refusals).toEqual([
		"agents/loop.md is a link that never resolves to a file, so it names no bytes",
	]);
	expect(body.digest).toBeUndefined();
	expect(text).not.toContain("ELOOP");
	expect(body.refusals.join("")).not.toContain(corpus);
}

async function verifyServesALiveCorpusWithAnOutOfExtent(): Promise<void> {
	const { corpus, outside, backingRoot } = await escapingInstructionCorpus();

	const { response, text, body } = await workspace.corpusResponse({
		backingRoot,
		kind: "live",
		root: corpus,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(body.files.map(({ path }) => path)).toEqual([
		"skills/build/SKILL.md",
		"skills/discuss/SKILL.md",
	]);
	expect(body.refusals).toEqual([
		"Corpus file CLAUDE.md resolves outside the live corpus extent, which would hash bytes the corpus does not hold",
	]);
	expect(body.digest).toBeUndefined();
	expect(text).not.toContain("SECRET BYTES");
	expect(text).not.toContain(outside);
}

async function verifyRefusedCorpusPaths(
	_name: string,
	plant: CorpusEntryWriter,
	expectedRefusal: string,
): Promise<void> {
	const corpus = await workspace.corpusDirectory();
	await plant(join(corpus, "agents"));

	const { response, body } = await workspace.corpusResponse(
		directorySource(corpus),
	);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(body.refusals).toEqual([expectedRefusal]);
	expect(body.digest).toBeUndefined();
	expect(body.refusals.join("")).not.toContain(corpus);
}

type CorpusEntryWriter = (path: string) => Promise<void>;
