import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { z } from "zod";

import {
	LINK_CORPUS_COMMAND,
	SET_SPEND_CEILING_COMMAND,
} from "#benchmark/settings";
import {
	BROKEN_CASE,
	EFFORTLESS_CASE,
	LaunchFixture,
	PIPELINE_CASE,
	SESSION_CASE,
	UNMODELLED_CASE,
	refusalSchema,
} from "#server/launch-http-test-fixture";

const launchFixture = new LaunchFixture();

const { harness } = launchFixture;

afterEach(async () => {
	await launchFixture.dispose();
});

const settingsSchema = z.object({
	setCommand: z.string(),
	spendCeilingUsd: z.number().nullable(),
});

const launchCaseSchema = z.object({
	id: z.string(),
	kind: z.string(),
	model: z.string().nullable(),
	title: z.string(),
});

const unreadableCaseSchema = z.object({
	id: z.string(),
	reason: z.string(),
});

const casesSchema = z.object({
	cases: z.array(launchCaseSchema),
	unreadable: z.array(unreadableCaseSchema),
});

describe("GET /api/settings", () => {
	it(
		"reads the stored spend ceiling and the command that sets it",
		verifyReadsTheStoredSpendCeilingAndTheCommandThat,
	);
	it(
		"reads the command that links a corpus directory to edit",
		verifyReadsTheCommandThatLinksACorpusDirectoryTo,
	);
	it(
		"reads no ceiling when none is stored",
		verifyReadsNoCeilingWhenNoneIsStored,
	);
	it(
		"answers a conflict naming the fix when the settings file cannot be read",
		verifyAnswersAConflictNamingTheFixWhenTheSettings,
	);
});

describe("GET /api/cases", () => {
	it(
		"lists every declared case with the model it runs under",
		verifyListsEveryDeclaredCaseWithTheModelItRuns,
	);
});

async function verifyReadsTheStoredSpendCeilingAndTheCommandThat(): Promise<void> {
	const { get } = await harness();

	const response = await get("/api/settings");

	expect(settingsSchema.parse(await response.json())).toEqual({
		setCommand: SET_SPEND_CEILING_COMMAND,
		spendCeilingUsd: 5,
	});
}

async function verifyReadsTheCommandThatLinksACorpusDirectoryTo(): Promise<void> {
	const { get } = await harness();

	const response = await get("/api/settings");

	expect(
		z.object({ linkCommand: z.string() }).parse(await response.json()),
	).toEqual({ linkCommand: LINK_CORPUS_COMMAND });
}

async function verifyReadsNoCeilingWhenNoneIsStored(): Promise<void> {
	const { get } = await harness("missing");

	const response = await get("/api/settings");

	expect(
		settingsSchema.parse(await response.json()).spendCeilingUsd,
	).toBeNull();
}

async function verifyAnswersAConflictNamingTheFixWhenTheSettings(): Promise<void> {
	const { get, runsDirectory } = await harness("missing");
	await Bun.write(join(runsDirectory, "settings.json"), "not json");

	const response = await get("/api/settings");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(refusalSchema.parse(await response.json()).error).toContain(
		SET_SPEND_CEILING_COMMAND,
	);
}

async function verifyListsEveryDeclaredCaseWithTheModelItRuns(): Promise<void> {
	const { get } = await harness();

	const response = await get("/api/cases");

	expect(casesSchema.parse(await response.json())).toEqual({
		cases: [
			{
				id: "no-effort",
				kind: "session",
				model: "haiku",
				title: EFFORTLESS_CASE.title,
			},
			{
				id: "no-model",
				kind: "session",
				model: null,
				title: UNMODELLED_CASE.title,
			},
			{
				id: "pipe-case",
				kind: "pipeline",
				model: "sonnet",
				title: PIPELINE_CASE.title,
			},
			{
				id: "sess-case",
				kind: "session",
				model: "haiku",
				title: SESSION_CASE.title,
			},
		],
		unreadable: [
			{
				id: BROKEN_CASE.id,
				reason:
					"Case broken-case declaration has an invalid kind: Invalid discriminator value. Expected 'pipeline' | 'session'",
			},
		],
	});
}
