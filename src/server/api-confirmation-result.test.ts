import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { z } from "zod";

import { confirmationGroupPaths } from "#benchmark/run-layout";
import { directorySource } from "#benchmark/run-records-test-support";
import type ApiHttpDriver from "#server/api-test-http-driver";
import { ApiTestWorkspace } from "#server/api-test-workspace";
import {
	HTTP_STATUS_BAD_REQUEST,
	HTTP_STATUS_NOT_FOUND,
} from "#server/http-status";

const attemptStageSchema = z.object({ stage: z.string() }).loose();

const workspace = new ApiTestWorkspace();

afterEach(async () => {
	await workspace.dispose();
});

interface SavedRepFixture {
	readonly app: ApiHttpDriver;
	readonly groupId: string;
	readonly repId: string;
	readonly file: string;
}

async function savedRep(): Promise<SavedRepFixture> {
	const { fixture, app } = await workspace.serving();
	const groupId = "session-results";
	const [repId] =
		await fixture.confirmations.records.writeSessionGroup(groupId);
	if (repId === undefined) {
		throw new Error("The group fixture saved no rep");
	}

	return {
		app,
		file: confirmationGroupPaths(fixture.runsDirectory, groupId).rep(repId)
			.recordFile,
		groupId,
		repId,
	};
}

interface givenRequestedRepSParsedRecordFixture {
	readonly app: ApiHttpDriver;
	readonly groupId: "session-results";
	readonly repId: string;
}

async function givenRequestedRepSParsedRecord(): Promise<givenRequestedRepSParsedRecordFixture> {
	const fixture = await workspace.writtenFixture();
	const groupId = "session-results";
	const [repId] =
		await fixture.confirmations.records.writeSessionGroup(groupId);
	const corpusRoot = await workspace.corpusDirectory();
	const app = await workspace.start({
		runsDirectory: fixture.runsDirectory,
		source: directorySource(corpusRoot),
	});

	return { app, groupId, repId };
}

describe("GET /api/groups/:groupId/reps/:repId/attempt/result", () => {
	it(
		"refuses a saved record naming a different attempt",
		verifyRefusesASavedRecordNamingADifferentAttempt,
	);

	it(
		"serves the requested rep's parsed record without substituting group totals",
		verifyServesTheRequestedRepSParsedRecordWithoutSubstituting,
	);

	it.each([
		["..%2F..%2Fetc", "rep", HTTP_STATUS_BAD_REQUEST],
		["missing-group", "missing-rep", HTTP_STATUS_NOT_FOUND],
	] as const)(
		"answers an invalid or missing identity %s/%s",
		async (groupId, repId, status) => {
			const fixture = await workspace.writtenFixture();
			const corpusRoot = await workspace.corpusDirectory();
			const app = await workspace.start({
				runsDirectory: fixture.runsDirectory,
				source: directorySource(corpusRoot),
			});

			const response = await app.read(
				`/api/groups/${groupId}/reps/${repId}/attempt/result`,
			);

			expect(response.status).toBe(status);
			expect(await response.text()).not.toContain(fixture.runsDirectory);
		},
	);

	it("refuses a corrupt saved rep", verifyRefusesACorruptSavedRep);
});

async function verifyRefusesASavedRecordNamingADifferentAttempt(): Promise<void> {
	const { app, groupId, repId, file } = await savedRep();
	const text = await Bun.file(file).text();
	await Bun.write(file, text.replaceAll(groupId, "other-session-results"));
	const response = await app.read(
		`/api/groups/${groupId}/reps/${repId}/attempt/result`,
	);
	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(await response.text()).toContain("names a different attempt");
}

async function verifyServesTheRequestedRepSParsedRecordWithoutSubstituting(): Promise<void> {
	const { app, groupId, repId } = await givenRequestedRepSParsedRecord();

	const response = await app.read(
		`/api/groups/${groupId}/reps/${repId}/attempt/result`,
	);
	const body = z
		.object({
			groupId: z.string(),
			repId: z.string(),
			stages: z.array(attemptStageSchema),
		})
		.loose()
		.parse(await response.json());

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(body.groupId).toBe(groupId);
	expect(body.repId).toBe(repId);
	expect(body.stages.map(({ stage }) => stage)).toEqual(["checks"]);
}

async function verifyRefusesACorruptSavedRep(): Promise<void> {
	const fixture = await workspace.writtenFixture();
	const repId = `${fixture.groupId}-rep-1`;
	const file = confirmationGroupPaths(
		fixture.runsDirectory,
		fixture.groupId,
	).rep(repId).recordFile;
	await Bun.write(file, "broken json");
	const corpusRoot = await workspace.corpusDirectory();
	const app = await workspace.start({
		runsDirectory: fixture.runsDirectory,
		source: directorySource(corpusRoot),
	});

	const response = await app.read(
		`/api/groups/${fixture.groupId}/reps/${repId}/attempt/result`,
	);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_INTERNAL_SERVER_ERROR);
	expect(await response.text()).not.toContain(fixture.runsDirectory);
}
