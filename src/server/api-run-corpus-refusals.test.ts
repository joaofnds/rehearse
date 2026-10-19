import { afterEach, describe, expect, it } from "bun:test";
import { rm, symlink } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import type { CorpusRoot } from "#benchmark/corpus-file";
import { directorySource } from "#benchmark/run-records-test-support";
import {
	runHistoryResponseFrom,
	staleCausesOf,
} from "#server/api-test-responses";
import type { PipelineRunHistory } from "#server/api-test-responses";
import { ApiTestWorkspace } from "#server/api-test-workspace";

const EXPECTED_MINIMUM_RECORDED_ENTRY_COUNT = 1;

const workspace = new ApiTestWorkspace();

afterEach(async () => {
	await workspace.dispose();
});

async function historyFor(corpusSource: CorpusRoot): Promise<{
	readonly response: Response;
	readonly history: PipelineRunHistory;
}> {
	const fixture = await workspace.fixtureRecordingLiveSettings();
	const app = await workspace.start({
		runsDirectory: fixture.runsDirectory,
		source: corpusSource,
	});

	const response = await app.runs();

	const history = await runHistoryResponseFrom(response);

	return { history, response };
}

describe("GET /api/runs", () => {
	describe("when the corpus cannot supply its instruction file", () => {
		it(
			"names a CLAUDE.md that links out of a directory source as the cause",
			verifyNamesACLAUDEMdThatLinksOutOfA,
		);

		it(
			"names a CLAUDE.md that never resolves as the cause, not as a file that does not exist",
			verifyNamesACLAUDEMdThatNeverResolvesAsThe,
		);

		it(
			"names the absent instruction file as the cause, a corpus state the corpus report calls valid",
			verifyNamesTheAbsentInstructionFileAsTheCauseA,
		);

		it(
			"keeps every row readable, so history is not hidden behind one corpus state",
			verifyKeepsEveryRowReadableSoHistoryIsNotHidden,
		);
	});
});

async function verifyNamesACLAUDEMdThatLinksOutOfA(): Promise<void> {
	const { corpus, outside } = await workspace.corpusWithExternalInstructions();

	const { response, history: body } = await historyFor(directorySource(corpus));

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);

	expect(staleCausesOf(body)).toContain(
		"Corpus file CLAUDE.md resolves outside the corpus source, which would hash bytes the corpus does not hold",
	);
	expect(
		body.rows.some(
			({ staleness }) => staleness.state === "available" && staleness.stale,
		),
	).toBe(true);
	expect(JSON.stringify(body)).not.toContain("SECRET BYTES");
	expect(JSON.stringify(body)).not.toContain(outside);
}

async function verifyNamesACLAUDEMdThatNeverResolvesAsThe(): Promise<void> {
	const corpus = await workspace.corpusDirectory();
	const backingRoot = await workspace.emptyDirectory("rehearse-api-backing-");
	await rm(join(corpus, "CLAUDE.md"));
	await symlink(join(corpus, "CLAUDE.md"), join(corpus, "CLAUDE.md"));

	const { response, history: body } = await historyFor({
		backingRoot,
		kind: "live",
		root: corpus,
	});

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);

	expect(staleCausesOf(body)).toContain(
		"Corpus file CLAUDE.md is a link that never resolves to a file, so it names no bytes",
	);
}

async function verifyNamesTheAbsentInstructionFileAsTheCauseA(): Promise<void> {
	const corpus = await workspace.corpusDirectory();
	await rm(join(corpus, "CLAUDE.md"));

	const { response, history: body } = await historyFor(directorySource(corpus));

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);

	expect(staleCausesOf(body)).toContain(
		"Corpus file CLAUDE.md is not in the corpus under test, so a checkpoint that hashed it cannot be compared",
	);
}

async function verifyKeepsEveryRowReadableSoHistoryIsNotHidden(): Promise<void> {
	const corpus = await workspace.corpusDirectory();
	await rm(join(corpus, "CLAUDE.md"));

	const { response, history: body } = await historyFor(directorySource(corpus));

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);

	expect(body.rows.length).toBeGreaterThan(
		EXPECTED_MINIMUM_RECORDED_ENTRY_COUNT,
	);
	expect(body.unreadable).toEqual([]);
}
