import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { chmod, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import { RecordedRunsFixture } from "./run-records-test-support";
import { claimShortId, formatShortId, readShortIds } from "./short-id";
import {
	CASE_ID,
	EXECUTABLE_DIRECTORY_MODE,
	NO_ACCESS_MODE,
	ORDINAL_BASE,
	SUCCESSFUL_CHILD_EXIT_CODE,
	claimInProcesses,
	runsDirectory,
} from "./short-id-test-fixtures";

beforeEach(async () => {
	await mkdir(runsDirectory, { recursive: true });
});
afterEach(async () => {
	await rm(runsDirectory, { force: true, recursive: true });
});

async function givesEveryConcurrentClaimItsOwnNumberFrom1(): Promise<void> {
	const exits = await claimInProcesses({ claimsEach: 10, processes: 4 });

	expect(exits).toEqual(
		Array.from({ length: 4 }, () => SUCCESSFUL_CHILD_EXIT_CODE),
	);

	const named = await readShortIds(runsDirectory, CASE_ID);
	expect(named.map(({ shortId }) => shortId)).toEqual(
		[...Array.from({ length: 40 }).keys()].map(
			(index) => `audit-log/r${String(index + ORDINAL_BASE)}`,
		),
	);
}

async function numbersOnlyTheClaimedRecordFrom1(): Promise<void> {
	const fixture = new RecordedRunsFixture(runsDirectory);
	await fixture.pipeline.writePipelineRun({
		caseId: CASE_ID,
		run: "2026-09-01T00-00-00.000Z",
	});

	await claimShortId(runsDirectory, CASE_ID, {
		kind: "run",
		run: "2026-09-24T00-00-00.000Z",
	});

	expect(await readShortIds(runsDirectory, CASE_ID)).toEqual([
		{
			record: { kind: "run", run: "2026-09-24T00-00-00.000Z" },
			shortId: "audit-log/r1",
		},
	]);
}

async function givesARunAndAConfirmationGroupOfOneCaseDifferentNumbersFromOneSequence(): Promise<void> {
	const run = await claimShortId(runsDirectory, CASE_ID, {
		kind: "run",
		run: "2026-09-24T00-00-00.000Z",
	});
	const group = await claimShortId(runsDirectory, CASE_ID, {
		groupId: "group-1",
		kind: "group",
	});

	expect([formatShortId(run), formatShortId(group)]).toEqual([
		"audit-log/r1",
		"audit-log/g2",
	]);
}

async function numbersEachCaseOnItsOwn(): Promise<void> {
	await claimShortId(runsDirectory, CASE_ID, {
		kind: "run",
		run: "2026-09-24T00-00-00.000Z",
	});

	const other = await claimShortId(runsDirectory, "smoke", {
		caseId: "smoke",
		kind: "attempt:session",
		uuid: "0f6b6f2a-0000-4000-8000-000000000001",
	});

	expect(formatShortId(other)).toBe("smoke/r1");
}

async function namesNothingByThatNumberAndClaimsAboveIt(): Promise<void> {
	await claimShortId(runsDirectory, CASE_ID, {
		kind: "run",
		run: "2026-09-24T00-00-00.000Z",
	});
	await writeFile(join(runsDirectory, "short-ids", CASE_ID, "claims", "2"), "");

	const next = await claimShortId(runsDirectory, CASE_ID, {
		kind: "run",
		run: "2026-09-24T01-00-00.000Z",
	});

	expect(formatShortId(next)).toBe("audit-log/r3");
	expect(await readShortIds(runsDirectory, CASE_ID)).toEqual([
		{
			record: { kind: "run", run: "2026-09-24T00-00-00.000Z" },
			shortId: "audit-log/r1",
		},
		{
			record: { kind: "run", run: "2026-09-24T01-00-00.000Z" },
			shortId: "audit-log/r3",
		},
	]);
}

async function claimsAboveTheNumbersAndIgnoresTheFile(): Promise<void> {
	await claimShortId(runsDirectory, CASE_ID, {
		kind: "run",
		run: "2026-09-24T00-00-00.000Z",
	});
	await writeFile(
		join(runsDirectory, "short-ids", CASE_ID, "claims", ".DS_Store"),
		"",
	);

	const next = await claimShortId(runsDirectory, CASE_ID, {
		kind: "run",
		run: "2026-09-24T01-00-00.000Z",
	});

	const entries = await readShortIds(runsDirectory, CASE_ID);

	expect(formatShortId(next)).toBe("audit-log/r2");
	expect(entries.map(({ shortId }) => shortId)).toEqual([
		"audit-log/r1",
		"audit-log/r2",
	]);
}

async function refusesItAndWritesNothing(): Promise<void> {
	const records = join(runsDirectory, "records");

	const failure = await failureOf(
		claimShortId(records, "../escaped", {
			kind: "run",
			run: "2026-09-24T00-00-00.000Z",
		}),
	);

	expect(failure.message).toContain("not a case id");
	expect(await readdir(runsDirectory)).toEqual([]);
}

async function saysSoRatherThanReadingItAsEmpty(): Promise<void> {
	await claimShortId(runsDirectory, CASE_ID, {
		kind: "run",
		run: "2026-09-24T00-00-00.000Z",
	});
	const claims = join(runsDirectory, "short-ids", CASE_ID, "claims");
	await chmod(claims, NO_ACCESS_MODE);

	try {
		const failure = await failureOf(readShortIds(runsDirectory, CASE_ID));

		expect(failure.message).toContain("EACCES");
	} finally {
		await chmod(claims, EXECUTABLE_DIRECTORY_MODE);
	}
}

describe(claimShortId.name, () => {
	it(
		"gives every concurrent claim its own number from 1",
		givesEveryConcurrentClaimItsOwnNumberFrom1,
	);

	describe("when a record of the case was written before its first claim", () => {
		it(
			"numbers only the claimed record, from 1",
			numbersOnlyTheClaimedRecordFrom1,
		);
	});

	it(
		"gives a run and a confirmation group of one case different numbers from one sequence",
		givesARunAndAConfirmationGroupOfOneCaseDifferentNumbersFromOneSequence,
	);

	it("numbers each case on its own", numbersEachCaseOnItsOwn);

	describe("when a writer died between creating its claim and writing it", () => {
		it(
			"names nothing by that number and claims above it",
			namesNothingByThatNumberAndClaimsAboveIt,
		);
	});
});

describe("when the registry directory holds a file that is not a number", () => {
	it(
		"claims above the numbers and ignores the file",
		claimsAboveTheNumbersAndIgnoresTheFile,
	);
});

describe("when a claim is asked for in a case id that names a path", () => {
	it("refuses it and writes nothing", refusesItAndWritesNothing);
});

describe("when a case's registry cannot be read", () => {
	it(
		"says so rather than reading it as empty",
		saysSoRatherThanReadingItAsEmpty,
	);
});
