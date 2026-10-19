import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONTROL_DIR } from "#benchmark/config";
import { directorySource } from "#benchmark/run-records-test-support";
import { ApiTestWorkspace } from "#server/api-test-workspace";

const workspace = new ApiTestWorkspace();

afterEach(async () => {
	await workspace.dispose();
});

describe("GET /api/throws", () => {
	it(
		"sanitizes an absolute path out of an error this module's own handlers did not anticipate",
		verifySanitizesAnAbsolutePathOutOfAnErrorThis,
	);
});

describe("GET /api/runs", () => {
	it(
		"names no absolute path when staleCheckpoints itself throws from a corpus root outside CONTROL_DIR",
		verifyNamesNoAbsolutePathWhenStaleCheckpointsItselfThrowsFrom,
	);
});

async function verifySanitizesAnAbsolutePathOutOfAnErrorThis(): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-api-throw-"));
	workspace.track(root);
	const corpusRoot = await workspace.corpusDirectory();
	const app = await workspace.start({
		runsDirectory: root,
		source: directorySource(corpusRoot),
		unhandledFailureMessage: `boom at ${CONTROL_DIR}/secret.json`,
	});

	const response = await app.read("/api/throws");
	const body = await response.text();

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_INTERNAL_SERVER_ERROR);
	expect(body).not.toContain(CONTROL_DIR);
}

async function verifyNamesNoAbsolutePathWhenStaleCheckpointsItselfThrowsFrom(): Promise<void> {
	const { fixture, corpus, app } = await workspace.serving();
	await fixture.corpus.recordCorpusFrom(directorySource(corpus));
	await rm(join(corpus, "skills", "build"), { recursive: true });

	const response = await app.runs();
	const body = await response.text();

	expect(body).not.toContain(corpus);
}
