import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
	bindReplay,
	claimShortId,
	readShortIds,
	resolveShortId,
} from "./short-id";
import { CASE_ID, runsDirectory } from "./short-id-test-fixtures";

beforeEach(async () => {
	await mkdir(runsDirectory, { recursive: true });
});
afterEach(async () => {
	await rm(runsDirectory, { force: true, recursive: true });
});

async function namesTheReplaySRecordByTheNumberItsClaimTook(): Promise<void> {
	const claimed = await claimShortId(runsDirectory, CASE_ID, {
		kind: "replay",
		run: "2026-09-24T00-00-00.000Z",
		stage: "build",
	});

	await bindReplay(runsDirectory, claimed, {
		lineage: "lineage-build",
		timestamp: "2026-09-24T02-00-00.000Z",
	});

	expect(await readShortIds(runsDirectory, CASE_ID)).toEqual([
		{
			record: {
				kind: "attempt:stage",
				lineage: "lineage-build",
				timestamp: "2026-09-24T02-00-00.000Z",
			},
			shortId: "audit-log/r1",
		},
	]);
}

async function namesNothingByItsNumber(): Promise<void> {
	await claimShortId(runsDirectory, CASE_ID, {
		kind: "replay",
		run: "2026-09-24T00-00-00.000Z",
		stage: "build",
	});

	expect(await readShortIds(runsDirectory, CASE_ID)).toEqual([]);
}

async function namesTheRecordItsNumberWasClaimedFor(): Promise<void> {
	const claimed = await claimShortId(runsDirectory, CASE_ID, {
		groupId: "group-1",
		kind: "group",
	});

	expect(await resolveShortId(runsDirectory, claimed)).toEqual({
		groupId: "group-1",
		kind: "group",
	});
}

async function namesNothingwhenTheLetterDoesNotMatchTheKindClaimed(): Promise<void> {
	const claimed = await claimShortId(runsDirectory, CASE_ID, {
		groupId: "group-1",
		kind: "group",
	});

	expect(
		await resolveShortId(runsDirectory, { ...claimed, kind: "run" }),
	).toBeUndefined();
}

async function namesNothingwhenAClaimNamesARecordByAPath(): Promise<void> {
	const claims = join(runsDirectory, "short-ids", CASE_ID, "claims");
	await claimShortId(runsDirectory, CASE_ID, {
		groupId: "group-1",
		kind: "group",
	});
	await writeFile(
		join(claims, "2"),
		JSON.stringify({ groupId: "../../outside", kind: "group" }),
	);

	expect(
		await resolveShortId(runsDirectory, {
			caseId: CASE_ID,
			kind: "group",
			number: 2,
		}),
	).toBeUndefined();
}

async function namesNothingAndCreatesNone(): Promise<void> {
	expect(
		await resolveShortId(runsDirectory, {
			caseId: CASE_ID,
			kind: "run",
			number: 1,
		}),
	).toBeUndefined();
	expect(await readdir(runsDirectory)).toEqual([]);
}

describe(bindReplay.name, () => {
	it(
		"names the replay's record by the number its claim took",
		namesTheReplaySRecordByTheNumberItsClaimTook,
	);

	describe("when the replay failed before it was bound", () => {
		it("names nothing by its number", namesNothingByItsNumber);
	});
});

describe(resolveShortId.name, () => {
	it(
		"names the record its number was claimed for",
		namesTheRecordItsNumberWasClaimedFor,
	);

	describe("when the letter does not match the kind claimed", () => {
		it("names nothing", namesNothingwhenTheLetterDoesNotMatchTheKindClaimed);
	});

	describe("when a claim names a record by a path", () => {
		it("names nothing", namesNothingwhenAClaimNamesARecordByAPath);
	});

	describe("when no registry exists for the case", () => {
		it("names nothing and creates none", namesNothingAndCreatesNone);
	});
});
