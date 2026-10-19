import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";
import { dirname, join } from "node:path";

import { z } from "zod";

import { recordAnalysis } from "#benchmark/root-cause-analysis-provider-test-fixtures";
import { RUN } from "#benchmark/root-cause-analysis-test-support";
import {
	analysesOf,
	clearAnalysisRoots,
	recordedRun,
} from "#server/root-cause-analysis-test-fixture";

const unreadableAnalysisSchema = z.object({
	file: z.string(),
	reason: z.string(),
});

const readingSchema = z.object({
	newest: z.unknown(),
	request: z.object({
		capUsd: z.number().nullable(),
		refusal: z.string().nullable(),
	}),
	unreadable: z.array(unreadableAnalysisSchema),
});

afterEach(clearAnalysisRoots);

describe("GET /api/runs/:run/analyses", () => {
	it(
		"serves the run's newest analysis and how many earlier ones it holds",
		verifyServesTheRunSNewestAnalysisAndHowManyEarlierOnesItHolds,
	);

	it(
		"says a run with no analysis has none",
		verifySaysARunWithNoAnalysisHasNone,
	);

	it(
		"serves a failed analysis as the newest when it came last",
		verifyServesAFailedAnalysisAsTheNewestWhenItCameLast,
	);

	describe("when the newest analysis predates the rename to root-cause analysis", () => {
		it("serves it under the new names", verifyServesItUnderTheNewNames);
	});

	describe("when an analysis record cannot be read", () => {
		it(
			"lists it apart and still serves the readable ones",
			verifyListsItApartAndStillServesTheReadableOnes,
		);
	});
});

async function verifyServesTheRunSNewestAnalysisAndHowManyEarlierOnesItHolds(): Promise<void> {
	const directory = await recordedRun();
	const newest = await recordAnalysis(directory, "2026-10-04T13:00:00.000Z");
	await recordAnalysis(directory, "2026-10-04T12:00:00.000Z");

	const response = await analysesOf(directory, RUN);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toMatchObject({
		earlierCount: 1,
		newest: newest.record,
		run: RUN,
		unreadable: [],
	});
}

async function verifySaysARunWithNoAnalysisHasNone(): Promise<void> {
	const directory = await recordedRun();

	const response = await analysesOf(directory, RUN);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toMatchObject({
		earlierCount: 0,
		newest: null,
		run: RUN,
	});
}

async function verifyServesAFailedAnalysisAsTheNewestWhenItCameLast(): Promise<void> {
	const directory = await recordedRun();
	await recordAnalysis(directory, "2026-10-04T12:00:00.000Z");
	const failed = await recordAnalysis(directory, "2026-10-04T13:00:00.000Z", {
		rootCause: null,
	});

	const response = await analysesOf(directory, RUN);

	expect(failed.record.outcome).toBe("failed");
	expect(await response.json()).toMatchObject({
		earlierCount: 1,
		newest: failed.record,
	});
}

async function verifyServesItUnderTheNewNames(): Promise<void> {
	const directory = await recordedRun();
	const earlier = await recordAnalysis(directory, "2026-10-04T12:00:00.000Z");
	const { run, model, capUsd, durationMs, bundleDigest, bundleBytes } =
		earlier.record;
	await Bun.write(
		join(dirname(earlier.file), "2026-10-04T13-00-00.000Z.json"),
		JSON.stringify({
			bundleBytes,
			bundleDigest,
			capUsd,
			culprit: null,
			durationMs,
			model,
			narrative: "No corpus file explains the outcome.",
			outcome: "recorded",
			pairedRerun: "Rerun build with the location stated in the task.",
			run,
			schemaVersion: 1,
			stages: [
				{
					contribution: "placed code at a path the rubric rejected",
					note: "No corpus file build read names a directory.",
					role: "not implicated",
					stage: "build",
				},
			],
			startedAt: "2026-10-04T13:00:00.000Z",
		}),
	);

	const response = await analysesOf(directory, RUN);

	expect(await response.json()).toMatchObject({
		earlierCount: 1,
		newest: {
			rootCause: null,
			schemaVersion: 2,
			stages: [{ role: "not a factor", stage: "build" }],
			startedAt: "2026-10-04T13:00:00.000Z",
		},
		unreadable: [],
	});
}

async function verifyListsItApartAndStillServesTheReadableOnes(): Promise<void> {
	const directory = await recordedRun();
	const readable = await recordAnalysis(directory, "2026-10-04T12:00:00.000Z");
	await Bun.write(
		join(dirname(readable.file), "2026-10-04T13-00-00.000Z.json"),
		'{"schemaVersion":2,',
	);

	const response = await analysesOf(directory, RUN);
	const reading = readingSchema.parse(await response.json());

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(reading.newest).toEqual(readable.record);
	expect(reading.unreadable.map(({ file }) => file)).toEqual([
		"2026-10-04T13-00-00.000Z.json",
	]);
	const [observedFirstUnreadable] = reading.unreadable;

	expect(observedFirstUnreadable?.reason).not.toContain(directory);
}
