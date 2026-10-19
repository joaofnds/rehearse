import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import ReadManifestEntryBuilder from "#benchmark/read-manifest-entry-test-builder";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import { directorySource } from "#benchmark/run-records-test-support";
import { ApiTestWorkspace } from "#server/api-test-workspace";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

const workspace = new ApiTestWorkspace();

afterEach(async () => {
	await workspace.dispose();
});

describe("GET /api/groups/:groupId/reads", () => {
	it(
		"serves each rep stage's reads with whether each file changed since",
		verifyServesEachRepStageSReadsWithWhetherEach,
	);

	it(
		"serves the reps' reads unjudged and names why they could not be judged",
		verifyServesTheRepsReadsUnjudgedAndNamesWhyThey,
	);

	it(
		"names a missing frozen pipeline by its path in the group, not an absolute one",
		verifyNamesAMissingFrozenPipelineByItsPathIn,
	);

	it(
		"refuses a group that was never recorded, naming no absolute path",
		verifyRefusesAGroupThatWasNeverRecordedNamingNo,
	);

	it(
		"refuses a group id that escapes the runs directory, without a 500",
		verifyRefusesAGroupIdThatEscapesTheRunsDirectory,
	);
});

async function verifyServesEachRepStageSReadsWithWhetherEach(): Promise<void> {
	const { corpus, fixture, app } = await workspace.serving();
	await fixture.confirmations.corpus.recordGroupFrom(directorySource(corpus));
	const repId = `${fixture.groupId}-rep-1`;
	const read = new ReadManifestEntryBuilder().build();
	await fixture.confirmations.reads.recordGroupRepReadManifest({
		readManifest: [read],
		repId,
		stage: "build",
	});
	await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "edited\n");

	const response = await app.groupReads(fixture.groupId);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toEqual({
		reasons: [],
		reps: [
			{
				readManifest: [{ ...read, state: "changed" }],
				repId,
				stage: "build",
			},
		],
	});
}

async function verifyServesTheRepsReadsUnjudgedAndNamesWhyThey(): Promise<void> {
	const fixture = await workspace.writtenFixture();
	const repId = `${fixture.groupId}-rep-1`;
	const read = new ReadManifestEntryBuilder({
		sha256: "a".repeat(SHA256_HEX_DIGITS),
	}).build();
	await fixture.confirmations.reads.recordGroupRepReadManifest({
		readManifest: [read],
		repId,
		stage: "build",
	});
	const corpusRoot = await workspace.corpusDirectory();
	const app = await workspace.start({
		runsDirectory: fixture.runsDirectory,
		source: directorySource(corpusRoot),
	});

	const response = await app.groupReads(fixture.groupId);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toEqual({
		reasons: [
			"Reads not judged: the group froze no pipeline to hash its stages against",
		],
		reps: [{ readManifest: [read], repId, stage: "build" }],
	});
}

async function verifyNamesAMissingFrozenPipelineByItsPathIn(): Promise<void> {
	const { corpus, fixture, app } = await workspace.serving();
	await fixture.confirmations.corpus.recordGroupFrom(directorySource(corpus));
	const { inputsDirectory } = confirmationGroupPaths(
		fixture.runsDirectory,
		fixture.groupId,
	);
	await rm(join(inputsDirectory, "pipeline.json"));

	const response = await app.groupReads(fixture.groupId);
	const body = await response.text();

	expect(JSON.parse(body)).toEqual({
		reasons: [
			"Reads not judged: the group's frozen pipeline inputs/pipeline.json is missing",
		],
		reps: [],
	});
	expect(body).not.toContain(fixture.runsDirectory);
}

async function verifyRefusesAGroupThatWasNeverRecordedNamingNo(): Promise<void> {
	const fixture = await workspace.writtenFixture();
	const corpusRoot = await workspace.corpusDirectory();
	const app = await workspace.start({
		runsDirectory: fixture.runsDirectory,
		source: directorySource(corpusRoot),
	});

	const response = await app.groupReads("no-such-group");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
	expect(await response.text()).not.toContain(fixture.runsDirectory);
}

async function verifyRefusesAGroupIdThatEscapesTheRunsDirectory(): Promise<void> {
	const fixture = await workspace.writtenFixture();
	const corpusRoot = await workspace.corpusDirectory();
	const app = await workspace.start({
		runsDirectory: fixture.runsDirectory,
		source: directorySource(corpusRoot),
	});

	const response = await app.groupReads("..%2F..%2Fetc");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
}
