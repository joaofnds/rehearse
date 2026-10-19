import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	setDefaultTimeout,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RECORDS_DIRECTORY_VARIABLE } from "#benchmark/config";
import { EXIT_CODES } from "#benchmark/exit-codes";

import {
	CLI_TEST_TIMEOUT_MS,
	environmentWithoutKnobs,
	runCli,
} from "./cli-process-test-driver";

setDefaultTimeout(CLI_TEST_TIMEOUT_MS);

const records = join(tmpdir(), `rehearse-cli-link-${randomUUID()}`);

const corpus = join(tmpdir(), `rehearse-cli-corpus-${randomUUID()}`);

const inRecords = (): ReturnType<typeof environmentWithoutKnobs> => ({
	...environmentWithoutKnobs(),
	[RECORDS_DIRECTORY_VARIABLE]: records,
});

async function isReadBackByANewProcessAfterOne(): Promise<void> {
	await runCli(["settings", "--link-corpus", corpus], "empty", inRecords());

	const result = await runCli(["settings", "--json"], "empty", inRecords());

	expect(result.exitCode).toBe(EXIT_CODES.completed);
	expect(JSON.parse(result.stdout)).toEqual({
		linkedCorpusDirectory: corpus,
		recordsDirectory: records,
	});
}

async function isGoneForANewProcessAfterOneUnlinks(): Promise<void> {
	await runCli(["settings", "--link-corpus", corpus], "empty", inRecords());
	await runCli(["settings", "--unlink-corpus"], "empty", inRecords());

	const result = await runCli(["settings", "--json"], "empty", inRecords());

	expect(JSON.parse(result.stdout)).toEqual({ recordsDirectory: records });
}

async function refusesADirectoryHoldingNoCorpusAsAUsage(): Promise<void> {
	const result = await runCli(
		["settings", "--link-corpus", records],
		"empty",
		inRecords(),
	);

	expect(result.exitCode).toBe(EXIT_CODES.usageError);
	expect(result.stderr).toContain(records);
}

describe("the linked corpus", () => {
	beforeEach(async () => {
		await mkdir(records, { recursive: true });
		await mkdir(corpus, { recursive: true });
		await Bun.write(join(corpus, "CLAUDE.md"), "linked\n");
	});
	afterEach(async () => {
		await rm(records, { force: true, recursive: true });
		await rm(corpus, { force: true, recursive: true });
	});
	it(
		"is read back by a new process after one links it",
		isReadBackByANewProcessAfterOne,
	);
	it(
		"is gone for a new process after one unlinks it",
		isGoneForANewProcessAfterOneUnlinks,
	);
	it(
		"refuses a directory holding no corpus as a usage error",
		refusesADirectoryHoldingNoCorpusAsAUsage,
	);
});
