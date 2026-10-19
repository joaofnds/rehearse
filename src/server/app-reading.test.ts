import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { z } from "zod";

import createAppServer from "#server/app";
import { recordedApp, timedRowSchema } from "#server/app-reading-test-fixture";
import {
	appServer,
	clearAppRoots,
	corpusResponseSchema,
} from "#server/app-test-fixture";

afterEach(clearAppRoots);

const ELAPSED_TIME_UPDATE_MS = 123;

const REMOVED_RECORD_COUNT = 1;

const runHistoryResponseSchema = z.object({ rows: z.array(z.unknown()) });

describe(createAppServer.name, () => {
	it("serves the API under /api", verifyServesTheAPIUnderApi);

	it(
		"answers separate freshness readings with the same judgments as the full history",
		verifyAnswersSeparateFreshnessReadingsWithTheSameJudgmentsAs,
	);

	it(
		"sees external record replacement and deletion after a cached read",
		verifySeesExternalRecordReplacementAndDeletionAfterACached,
	);

	it(
		"answers the corpus identity without record usage and sees subsequent file edits",
		verifyAnswersTheCorpusIdentityWithoutRecordUsageAndSees,
	);
});

async function verifyServesTheAPIUnderApi(): Promise<void> {
	const { driver } = await appServer();

	const response = await driver.read("/api/runs");
	const body = runHistoryResponseSchema.parse(await response.json());

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(body.rows).toEqual([]);
}

async function verifyAnswersSeparateFreshnessReadingsWithTheSameJudgmentsAs(): Promise<void> {
	const { driver } = await recordedApp();
	const fullResponse = await driver.read("/api/runs");
	const stalenessRowSchema = z.object({
		recordId: z.string(),
		staleness: z.unknown(),
	});

	const full = z
		.object({
			rows: z.array(stalenessRowSchema),
		})
		.parse(await fullResponse.json());

	const response = await driver.read("/api/run-staleness");
	const reading = z
		.object({ records: z.record(z.string(), z.unknown()) })
		.parse(await response.json());

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(full.rows.map(({ recordId }) => reading.records[recordId])).toEqual(
		full.rows.map(({ staleness }) => staleness),
	);
}

async function verifySeesExternalRecordReplacementAndDeletionAfterACached(): Promise<void> {
	const { driver, fixture, record } = await recordedApp();
	await driver.read("/api/run-listing");
	await Bun.write(
		fixture.sessionAttemptFile,
		JSON.stringify({
			...record,
			elapsedMs: record.elapsedMs + ELAPSED_TIME_UPDATE_MS,
		}),
	);

	const response = await driver.read("/api/run-listing");

	const listing = z
		.object({
			rows: z.array(timedRowSchema),
		})
		.parse(await response.json());

	expect({
		status: response.status,
		wallTime: listing.rows.find(({ kind }) => kind === "session-attempt")
			?.wallTime,
	}).toEqual({
		status: HTTP_STATUS.HTTP_STATUS_OK,
		wallTime: {
			ms: record.elapsedMs + ELAPSED_TIME_UPDATE_MS,
			state: "available",
		},
	});

	await rm(fixture.sessionAttemptFile);
	const removedResponse = await driver.read("/api/run-listing");
	const removed = runHistoryResponseSchema.parse(await removedResponse.json());
	expect(removed.rows).toHaveLength(listing.rows.length - REMOVED_RECORD_COUNT);
}

async function verifyAnswersTheCorpusIdentityWithoutRecordUsageAndSees(): Promise<void> {
	const { driver, liveRoot } = await appServer("linked");
	const firstResponse = await driver.read("/api/corpus-summary");
	const first = corpusResponseSchema.parse(await firstResponse.json());
	await Bun.write(join(liveRoot, "CLAUDE.md"), "new instructions\n");

	const response = await driver.read("/api/corpus-summary");
	const body: unknown = await response.json();
	const summary = corpusResponseSchema.parse(body);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(summary.digest).not.toBe(first.digest);
	expect(body).not.toHaveProperty("lastEdit");
}
