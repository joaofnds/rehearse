import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { z } from "zod";

import ReadManifestEntryBuilder from "#benchmark/read-manifest-entry-test-builder";
import { directorySource } from "#benchmark/run-records-test-support";
import { ApiTestWorkspace } from "#server/api-test-workspace";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

const corpusFileSchema = z.object({ path: z.string() }).loose();

const workspace = new ApiTestWorkspace();

afterEach(async () => {
	await workspace.dispose();
});

describe("GET /api/records/:id", () => {
	it(
		"serves a confirmation rep's stage file with the reads it recorded",
		verifyServesAConfirmationRepSStageFileWithThe,
	);

	it(
		"refuses a record id whose segment escapes the runs directory, without a 500",
		verifyRefusesARecordIdWhoseSegmentEscapesTheRuns,
	);

	it(
		"names no absolute filesystem path in a refusal body",
		verifyNamesNoAbsoluteFilesystemPathInARefusalBody,
	);

	it(
		"names no absolute filesystem path when the checkpoint stage in the id was never recorded",
		verifyNamesNoAbsoluteFilesystemPathWhenTheCheckpointStage,
	);
});

async function verifyServesAConfirmationRepSStageFileWithThe(): Promise<void> {
	const fixture = await workspace.writtenFixture();
	const repId = `${fixture.groupId}-rep-1`;
	await fixture.confirmations.reads.recordGroupRepReadManifest({
		readManifest: [
			new ReadManifestEntryBuilder({
				sha256: "b".repeat(SHA256_HEX_DIGITS),
			}).build(),
		],
		repId,
		stage: "build",
	});
	const corpusRoot = await workspace.corpusDirectory();
	const app = await workspace.start({
		runsDirectory: fixture.runsDirectory,
		source: directorySource(corpusRoot),
	});

	const response = await app.record(
		`rep:stage:${fixture.groupId}/${repId}/build`,
	);
	const json: unknown = await response.json();

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	const body = z
		.object({
			readManifest: z.array(corpusFileSchema),
		})
		.loose()
		.parse(json);
	expect(body.readManifest.map((entry) => entry.path)).toEqual([
		"skills/build/SKILL.md",
	]);
}

async function verifyRefusesARecordIdWhoseSegmentEscapesTheRuns(): Promise<void> {
	const fixture = await workspace.writtenFixture();
	const corpusRoot = await workspace.corpusDirectory();
	const app = await workspace.start({
		runsDirectory: fixture.runsDirectory,
		source: directorySource(corpusRoot),
	});

	const response = await app.record("checkpoint:../../etc/passwd/shape");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
}

async function verifyNamesNoAbsoluteFilesystemPathInARefusalBody(): Promise<void> {
	const fixture = await workspace.writtenFixture();
	const corpusRoot = await workspace.corpusDirectory();
	const app = await workspace.start({
		runsDirectory: fixture.runsDirectory,
		source: directorySource(corpusRoot),
	});

	const response = await app.record("run:no-such-run");
	const body = await response.text();

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
	expect(body).not.toContain(fixture.runsDirectory);
}

async function verifyNamesNoAbsoluteFilesystemPathWhenTheCheckpointStage(): Promise<void> {
	const fixture = await workspace.writtenFixture();
	const corpusRoot = await workspace.corpusDirectory();
	const app = await workspace.start({
		runsDirectory: fixture.runsDirectory,
		source: directorySource(corpusRoot),
	});
	const id = `checkpoint:${fixture.replayableRun}/no-such-stage`;

	const response = await app.record(id);
	const body = await response.text();

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
	expect(body).not.toContain(fixture.runsDirectory);
}
