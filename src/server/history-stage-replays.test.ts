import { afterEach, describe, expect, it } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import {
	directorySource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import {
	clearHistoryRoots,
	corpusDirectory,
	writtenFixture,
} from "#server/history-workspace-test-fixture";

import { runHistoryReport } from "./run-history";

afterEach(clearHistoryRoots);

describe(runHistoryReport.name, () => {
	describe("when the replay matches its source run", () => {
		it(
			"lists it as a row naming its source run's case, its stage grade, and the page that opens its context",
			verifyListsItAsARowNamingItsSourceRun,
		);
	});

	describe("when the replay was filed under another lineage", () => {
		it(
			"names its context unavailable when it is filed under a lineage it did not consume",
			verifyNamesItsContextUnavailableWhenItIsFiledUnder,
		);
	});

	describe("when the source manifest is missing", () => {
		it(
			"names its context unavailable when its source run's manifest is gone",
			verifyNamesItsContextUnavailableWhenItsSourceRunS,
		);
	});
});

async function verifyListsItAsARowNamingItsSourceRun(): Promise<void> {
	const fixture = await writtenFixture();
	const { lineage, timestamp } = fixture.stageAttempt;

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(rows.find((row) => row.kind === "replay")).toMatchObject({
		caseId: "audit-log",
		grade: "A",
		lineage,
		links: [
			{
				href: `/replays/${lineage}/${timestamp}`,
				label: "context",
				state: "available",
			},
		],
		stage: "build",
		status: "CONTINUE",
		timestamp,
	});
}

async function verifyNamesItsContextUnavailableWhenItIsFiledUnder(): Promise<void> {
	const fixture = await writtenFixture();
	const { timestamp } = fixture.stageAttempt;
	await Bun.write(
		join(
			fixture.runsDirectory,
			"replays",
			"lineage-other",
			`${timestamp}.json`,
		),
		await Bun.file(fixture.stageAttemptFile).text(),
	);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(
		rows.find(
			(row) => row.kind === "replay" && row.lineage === "lineage-other",
		),
	).toMatchObject({
		links: [
			{
				label: "context",
				reason: "filed under a lineage it did not consume",
				state: "unavailable",
			},
		],
	});
}

async function verifyNamesItsContextUnavailableWhenItsSourceRunS(): Promise<void> {
	const fixture = await writtenFixture();
	await rm(
		benchmarkRunPaths(fixture.runsDirectory, fixture.replayableRun)
			.manifestFile,
	);

	const { rows } = await runHistoryReport(
		{
			runsDirectory: fixture.runsDirectory,
			source: directorySource(await corpusDirectory("build skill\n")),
		},
		nothingRunning,
	);

	expect(rows.find((row) => row.kind === "replay")).toMatchObject({
		caseId: undefined,
		links: [
			{
				label: "context",
				reason: "source run manifest not recorded",
				state: "unavailable",
			},
		],
	});
}
