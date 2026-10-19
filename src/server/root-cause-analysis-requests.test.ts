import { afterEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { z } from "zod";

import { recordAnalysis } from "#benchmark/root-cause-analysis-provider-test-fixtures";
import { RUN } from "#benchmark/root-cause-analysis-test-support";
import {
	SET_SPEND_CEILING_COMMAND,
	storeSpendCeiling,
} from "#benchmark/settings";
import {
	analysesOf,
	clearAnalysisRoots,
	recordedRun,
} from "#server/root-cause-analysis-test-fixture";

const refusalSchema = z.object({ error: z.string() });

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
		"states what a requested analysis may spend and the model it runs under",
		verifyStatesWhatARequestedAnalysisMaySpendAndTheModelItRunsUnder,
	);
	describe("when the stored ceiling is below the analysis budget", () => {
		it(
			"states the ceiling as what it may spend",
			verifyStatesTheCeilingAsWhatItMaySpend,
		);
	});
	describe("when no spend ceiling is stored", () => {
		it(
			"states that a request would be refused, and how to allow one",
			verifyStatesThatARequestWouldBeRefusedAndHowToAllowOne,
		);
	});
	describe("when the settings file cannot be read", () => {
		it(
			"still serves the analyses, and states the refusal without the records path",
			verifyStillServesTheAnalysesAndStatesTheRefusalWithoutTheRecordsPath,
		);
	});
	describe("when the settings file exists but cannot be opened", () => {
		it(
			"still serves the analyses, and states the refusal",
			verifyStillServesTheAnalysesAndStatesTheRefusal,
		);
	});
	describe("when the run is not recorded", () => {
		it("answers not found", verifyAnswersNotFound);
	});
});

async function verifyStatesWhatARequestedAnalysisMaySpendAndTheModelItRunsUnder(): Promise<void> {
	const storedCeilingUsd = 30;

	const directory = await recordedRun();
	await storeSpendCeiling(directory, storedCeilingUsd);

	const response = await analysesOf(directory, RUN);

	expect(await response.json()).toMatchObject({
		request: { capUsd: 1, model: "sonnet", refusal: null },
	});
}

async function verifyStatesTheCeilingAsWhatItMaySpend(): Promise<void> {
	const storedCeilingUsd = 0.5;

	const directory = await recordedRun();
	await storeSpendCeiling(directory, storedCeilingUsd);

	const response = await analysesOf(directory, RUN);

	expect(await response.json()).toMatchObject({
		request: { capUsd: 0.5, model: "sonnet", refusal: null },
	});
}

async function verifyStatesThatARequestWouldBeRefusedAndHowToAllowOne(): Promise<void> {
	const directory = await recordedRun();

	const response = await analysesOf(directory, RUN);
	const { request } = readingSchema.parse(await response.json());

	expect(request.capUsd).toBeNull();
	expect(request.refusal).toContain(SET_SPEND_CEILING_COMMAND);
}

async function verifyStillServesTheAnalysesAndStatesTheRefusalWithoutTheRecordsPath(): Promise<void> {
	const directory = await recordedRun();
	const newest = await recordAnalysis(directory, "2026-10-04T12:00:00.000Z");
	await Bun.write(join(directory, "settings.json"), "not json");

	const response = await analysesOf(directory, RUN);
	const reading = readingSchema.parse(await response.json());

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(reading.newest).toEqual(newest.record);
	expect(reading.request.capUsd).toBeNull();
	expect(reading.request.refusal).toContain(SET_SPEND_CEILING_COMMAND);
	expect(reading.request.refusal).not.toContain(directory);
}

async function verifyStillServesTheAnalysesAndStatesTheRefusal(): Promise<void> {
	const directory = await recordedRun();
	const newest = await recordAnalysis(directory, "2026-10-04T12:00:00.000Z");
	await mkdir(join(directory, "settings.json"));

	const response = await analysesOf(directory, RUN);
	const reading = readingSchema.parse(await response.json());

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(reading.newest).toEqual(newest.record);
	expect(reading.request.capUsd).toBeNull();
	expect(reading.request.refusal).not.toContain(directory);
}

async function verifyAnswersNotFound(): Promise<void> {
	const directory = await recordedRun();

	const response = await analysesOf(directory, "2026-01-01T00-00-00.000Z");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
	expect(refusalSchema.parse(await response.json()).error).toBe(
		"No run 2026-01-01T00-00-00.000Z is recorded",
	);
}
