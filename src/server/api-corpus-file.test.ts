import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { z } from "zod";

import { directorySource } from "#benchmark/run-records-test-support";
import type ApiHttpDriver from "#server/api-test-http-driver";
import { ApiTestWorkspace } from "#server/api-test-workspace";
import CORPUS_VERSION_HEADER from "#server/corpus-version-header";

const workspace = new ApiTestWorkspace();

afterEach(async () => {
	await workspace.dispose();
});

async function serving(): Promise<{
	readonly app: ApiHttpDriver;
	readonly corpus: string;
}> {
	const corpus = await workspace.corpusDirectory();

	return {
		app: await workspace.start({
			runsDirectory: await workspace.emptyDirectory("rehearse-api-runs-"),
			source: directorySource(corpus),
		}),
		corpus,
	};
}

describe("GET /api/corpus/file", () => {
	it(
		"serves a listed file's bytes as the corpus under test holds them, measured or not",
		verifyServesAListedFileSBytesAsTheCorpus,
	);

	it(
		"names the version the corpus holds, which the corpus report shows",
		verifyNamesTheVersionTheCorpusHoldsWhichTheCorpus,
	);

	it(
		"answers a request that names no path as a bad request",
		verifyAnswersARequestThatNamesNoPathAsA,
	);

	it.each(["agents/none.md", "../CLAUDE.md", "skills/build"])(
		"refuses %s, which the corpus report does not list",
		async (path) => {
			const { app } = await serving();

			const response = await app.corpusFile(path);

			expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
		},
	);
});

async function verifyServesAListedFileSBytesAsTheCorpus(): Promise<void> {
	const { app, corpus } = await serving();
	await Bun.write(join(corpus, "CLAUDE.md"), "edited on disk\n");

	const response = await app.corpusFile("CLAUDE.md");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.text()).toBe("edited on disk\n");
}

async function verifyNamesTheVersionTheCorpusHoldsWhichTheCorpus(): Promise<void> {
	const { app } = await serving();
	const reported = await app.read("/api/corpus");
	const report = z.object({ digest: z.string() }).parse(await reported.json());

	const response = await app.corpusFile("CLAUDE.md");

	expect(response.headers.get(CORPUS_VERSION_HEADER)).toBe(report.digest);
}

async function verifyAnswersARequestThatNamesNoPathAsA(): Promise<void> {
	const { app } = await serving();

	const response = await app.corpusFile();

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
}
