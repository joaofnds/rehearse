import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { withRecordReadScope } from "./record-read-scope";
import {
	bindReplay,
	claimShortId,
	readAllShortIds,
	readShortIds,
} from "./short-id";
import {
	CASE_ID,
	EXPECTED_RECORDED_SHORT_ID_COUNT,
	runsDirectory,
} from "./short-id-test-fixtures";

beforeEach(async () => {
	await mkdir(runsDirectory, { recursive: true });
});
afterEach(async () => {
	await rm(runsDirectory, { force: true, recursive: true });
});

async function reusesTheCollectedRegistryThenSeesAddedReplacedAndRemovedClaimsInLaterReports(): Promise<void> {
	await claimShortId(runsDirectory, CASE_ID, { kind: "run", run: "first" });
	const first = await withRecordReadScope(async () => {
		const all = await readAllShortIds(runsDirectory);
		await claimShortId(runsDirectory, CASE_ID, {
			kind: "run",
			run: "second",
		});
		await writeFile(
			join(runsDirectory, "short-ids", CASE_ID, "claims", "1"),
			JSON.stringify({ kind: "run", run: "replacement" }),
		);
		expect(await readShortIds(runsDirectory, CASE_ID)).toEqual(all.entries);

		return all.entries;
	});

	expect(first.map(({ record }) => record)).toEqual([
		{ kind: "run", run: "first" },
	]);
	expect(
		await withRecordReadScope(
			async () => await readShortIds(runsDirectory, CASE_ID),
		),
	).toEqual([
		{ record: { kind: "run", run: "replacement" }, shortId: "audit-log/r1" },
		{ record: { kind: "run", run: "second" }, shortId: "audit-log/r2" },
	]);
	await rm(join(runsDirectory, "short-ids", CASE_ID, "claims", "1"));
	expect(
		await withRecordReadScope(
			async () => await readShortIds(runsDirectory, CASE_ID),
		),
	).toEqual([
		{ record: { kind: "run", run: "second" }, shortId: "audit-log/r2" },
	]);
}

async function keepsSeparateCasesAndRecordsDirectoriesDistinct(): Promise<void> {
	const other = join(runsDirectory, "other-records");
	await claimShortId(runsDirectory, CASE_ID, { kind: "run", run: "first" });
	await claimShortId(runsDirectory, "other-case", {
		kind: "run",
		run: "second",
	});
	await claimShortId(other, CASE_ID, { kind: "run", run: "third" });

	await withRecordReadScope(async () => {
		const first = await readShortIds(runsDirectory, CASE_ID);
		const second = await readShortIds(runsDirectory, "other-case");
		const third = await readShortIds(other, CASE_ID);
		const [observedFirstFirst] = first;
		const [observedFirstSecond] = second;
		const [observedFirstThird] = third;

		expect(observedFirstFirst?.record).toEqual({
			kind: "run",
			run: "first",
		});
		expect(observedFirstSecond?.record).toEqual({
			kind: "run",
			run: "second",
		});
		expect(observedFirstThird?.record).toEqual({
			kind: "run",
			run: "third",
		});
	});
}

async function doesNotRetainAMissingRegistryOutsideTheReport(): Promise<void> {
	const expectedReadShortIdCount = 1;

	await withRecordReadScope(async () => {
		expect(await readShortIds(runsDirectory, CASE_ID)).toEqual([]);
		await claimShortId(runsDirectory, CASE_ID, { kind: "run", run: "first" });
		expect(await readShortIds(runsDirectory, CASE_ID)).toEqual([]);
	});
	expect(await readShortIds(runsDirectory, CASE_ID)).toHaveLength(
		expectedReadShortIdCount,
	);
	await claimShortId(runsDirectory, CASE_ID, { kind: "run", run: "second" });
	expect(await readShortIds(runsDirectory, CASE_ID)).toHaveLength(
		EXPECTED_RECORDED_SHORT_ID_COUNT,
	);
}

async function isolatesConcurrentReportsReadingTheSameRegistry(): Promise<void> {
	await claimShortId(runsDirectory, CASE_ID, { kind: "run", run: "first" });
	const read = Promise.withResolvers<undefined>();
	const changed = Promise.withResolvers<undefined>();
	const prior = withRecordReadScope(async () => {
		const first = await readShortIds(runsDirectory, CASE_ID);
		read.resolve();
		await changed.promise;
		expect(await readShortIds(runsDirectory, CASE_ID)).toEqual(first);
	});
	await read.promise;
	try {
		await claimShortId(runsDirectory, CASE_ID, {
			kind: "run",
			run: "second",
		});
		expect(
			await withRecordReadScope(
				async () => await readShortIds(runsDirectory, CASE_ID),
			),
		).toHaveLength(EXPECTED_RECORDED_SHORT_ID_COUNT);
	} finally {
		changed.resolve();
		await prior;
	}
}

async function rereadsAReplayBindingInTheNextReport(): Promise<void> {
	const claimed = await claimShortId(runsDirectory, CASE_ID, {
		kind: "replay",
		run: "source",
		stage: "build",
	});

	await withRecordReadScope(async () => {
		expect(await readShortIds(runsDirectory, CASE_ID)).toEqual([]);
		await bindReplay(runsDirectory, claimed, {
			lineage: "lineage-build",
			timestamp: "attempt-time",
		});
		expect(await readShortIds(runsDirectory, CASE_ID)).toEqual([]);
	});
	expect(
		await withRecordReadScope(
			async () => await readShortIds(runsDirectory, CASE_ID),
		),
	).toEqual([
		{
			record: {
				kind: "attempt:stage",
				lineage: "lineage-build",
				timestamp: "attempt-time",
			},
			shortId: "audit-log/r1",
		},
	]);
}

describe("registry reads within a report", () => {
	it(
		"reuses the collected registry, then sees added, replaced and removed claims in later reports",
		reusesTheCollectedRegistryThenSeesAddedReplacedAndRemovedClaimsInLaterReports,
	);

	it(
		"keeps separate cases and records directories distinct",
		keepsSeparateCasesAndRecordsDirectoriesDistinct,
	);

	it(
		"does not retain a missing registry outside the report",
		doesNotRetainAMissingRegistryOutsideTheReport,
	);

	it(
		"isolates concurrent reports reading the same registry",
		isolatesConcurrentReportsReadingTheSameRegistry,
	);

	it(
		"rereads a replay binding in the next report",
		rereadsAReplayBindingInTheNextReport,
	);
});
