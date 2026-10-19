import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
	directorySource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import { claimShortId } from "#benchmark/short-id";
import {
	clearHistoryRoots,
	corpusDirectory,
	fixtureWithClaimedRun,
} from "#server/history-workspace-test-fixture";

import { runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

describe("history claim refusals", () => {
	it(
		"keeps the short ids of every case whose registry reads when one case's registry cannot be read",
		verifyKeepsTheShortIdsOfEveryCaseWhoseRegistry,
	);

	it(
		"reports each case whose registry cannot be read under its own id",
		verifyReportsEachCaseWhoseRegistryCannotBeReadUnder,
	);

	it(
		"lists every record without short ids when the cases' registries cannot be listed",
		verifyListsEveryRecordWithoutShortIdsWhenTheCases,
	);
});

async function verifyKeepsTheShortIdsOfEveryCaseWhoseRegistry(): Promise<void> {
	const fixture = await fixtureWithClaimedRun();
	await claimShortId(fixture.runsDirectory, "smoke", {
		kind: "attempt:session",
		...fixture.sessionAttempt,
	});
	await mkdir(
		join(fixture.runsDirectory, "short-ids", "audit-log", "claims", "99"),
	);

	const { rows, unreadable } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(
		rows.map(({ kind, caseId, shortId }) => ({ caseId, kind, shortId })),
	).toEqual([
		{ caseId: "audit-log", kind: "run", shortId: undefined },
		{ caseId: "audit-log", kind: "replay", shortId: undefined },
		{ caseId: "audit-log", kind: "run", shortId: undefined },
		{ caseId: "audit-log", kind: "run", shortId: undefined },
		{ caseId: "smoke", kind: "session-attempt", shortId: "smoke/r1" },
		{ caseId: "audit-log", kind: "group", shortId: undefined },
	]);
	expect(unreadable.map(({ kind, id }) => ({ id, kind }))).toEqual([
		{ id: "short-ids/audit-log", kind: "short-ids" },
	]);
	const [observedFirstUnreadable] = unreadable;

	expect(observedFirstUnreadable?.reason).toContain(
		"Directories cannot be read",
	);
}

async function verifyReportsEachCaseWhoseRegistryCannotBeReadUnder(): Promise<void> {
	const fixture = await fixtureWithClaimedRun();
	await claimShortId(fixture.runsDirectory, "smoke", {
		kind: "attempt:session",
		...fixture.sessionAttempt,
	});
	await mkdir(
		join(fixture.runsDirectory, "short-ids", "audit-log", "claims", "99"),
	);
	await mkdir(
		join(fixture.runsDirectory, "short-ids", "smoke", "claims", "99"),
	);

	const { unreadable } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(unreadable.map(({ kind, id }) => ({ id, kind }))).toEqual([
		{ id: "short-ids/audit-log", kind: "short-ids" },
		{ id: "short-ids/smoke", kind: "short-ids" },
	]);
}

async function verifyListsEveryRecordWithoutShortIdsWhenTheCases(): Promise<void> {
	const fixture = await fixtureWithClaimedRun();
	const source = directorySource(await corpusDirectory("build skill\n"));
	const intact = await runHistoryReport(
		{ runsDirectory: fixture.runsDirectory, source },
		nothingRunning,
	);
	await rm(join(fixture.runsDirectory, "short-ids"), { recursive: true });
	await writeFile(join(fixture.runsDirectory, "short-ids"), "");

	const { rows, unreadable } = await runHistoryReport(
		{ runsDirectory: fixture.runsDirectory, source },
		nothingRunning,
	);

	expect(rows.map((row) => ({ kind: row.kind, shortId: row.shortId }))).toEqual(
		intact.rows.map((row) => ({ kind: row.kind, shortId: undefined })),
	);
	expect(unreadable.map(({ kind, id }) => ({ id, kind }))).toEqual([
		{ id: "short-ids", kind: "short-ids" },
	]);
	const [observedFirstUnreadable] = unreadable;

	expect(observedFirstUnreadable?.reason).not.toContain(fixture.runsDirectory);
}
