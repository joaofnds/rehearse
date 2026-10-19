import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";

import { sessionAttemptPaths } from "#benchmark/run-layout";
import {
	writtenIncompleteAttempt,
	writtenResumedAttempt,
} from "#server/session-history-attempt-test-fixture";
import { readSessionAttemptRequestSeries } from "#server/session-history-reader";
import { clearSessionHistoryRoots } from "#server/session-history-workspace-test-fixture";

afterEach(clearSessionHistoryRoots);

describe(readSessionAttemptRequestSeries.name, () => {
	describe("when the resumed attempt retains its transcript and boundary", () => {
		it(
			"totals only the attempt region of a resumed saved attempt",
			verifyTotalsOnlyTheAttemptRegionOfAResumedSaved,
		);

		it(
			"reports instruction loads unavailable when the transcript carries no attachment",
			verifyReportsInstructionLoadsUnavailableWhenTheTranscriptCarriesNo,
		);

		it(
			"carries the instruction loads the transcript attachment names",
			verifyCarriesTheInstructionLoadsTheTranscriptAttachmentNames,
		);

		it(
			"reads the provider cost the attempt record carries",
			verifyReadsTheProviderCostTheAttemptRecordCarries,
		);
	});

	describe("when the transcript is absent", () => {
		it(
			"reports totals unavailable rather than zero when the attempt saved no transcript",
			verifyReportsTotalsUnavailableRatherThanZeroWhenTheAttempt,
		);
	});

	describe("when the attempt boundary was not recorded", () => {
		it(
			"reports boundary-unknown with totals unavailable on an attempt carrying no boundary",
			verifyReportsBoundaryUnknownWithTotalsUnavailableOnAnAttempt,
		);
	});
});

async function verifyTotalsOnlyTheAttemptRegionOfAResumedSaved(): Promise<void> {
	const fixture = await writtenResumedAttempt();

	const { series } = await readSessionAttemptRequestSeries(fixture);

	expect(series.boundary).toBe("known");
	expect(series.attemptTotals).toEqual({
		requestCount: 1,
		state: "complete",
		totalInputTokens: 251_697,
		usage: {
			cacheReadTokens: 0,
			cacheWriteTokens: 251_695,
			inputTokens: 2,
			outputTokens: 151,
		},
	});
}

async function verifyReportsInstructionLoadsUnavailableWhenTheTranscriptCarriesNo(): Promise<void> {
	const fixture = await writtenResumedAttempt();

	const { instructionLoads } = await readSessionAttemptRequestSeries(fixture);

	expect(instructionLoads).toEqual({ state: "unavailable" });
}

async function verifyCarriesTheInstructionLoadsTheTranscriptAttachmentNames(): Promise<void> {
	const fixture = await writtenResumedAttempt();
	const paths = sessionAttemptPaths(fixture.runsDirectory, fixture);
	const transcript = await Bun.file(
		join(paths.directory, "transcript.jsonl"),
	).text();
	await Bun.write(
		join(paths.directory, "transcript.jsonl"),
		`${transcript}\n${JSON.stringify({
			attachment: {
				files: [{ content: "# it", path: "/work/CLAUDE.md", type: "Project" }],
				type: "instructions",
			},
			type: "attachment",
		})}`,
	);

	const { instructionLoads } = await readSessionAttemptRequestSeries(fixture);

	expect(instructionLoads).toEqual({
		loads: [
			{
				filePath: "/work/CLAUDE.md",
				loadReason: { state: "unavailable" },
				memoryType: "Project",
				parentFilePath: { state: "unavailable" },
				triggerFilePath: { state: "unavailable" },
			},
		],
		state: "available",
	});
}

async function verifyReadsTheProviderCostTheAttemptRecordCarries(): Promise<void> {
	const fixture = await writtenResumedAttempt();

	const { cost } = await readSessionAttemptRequestSeries(fixture);

	expect(cost.reported).toEqual({ costUsd: 1.008294, state: "complete" });
}

async function verifyReportsTotalsUnavailableRatherThanZeroWhenTheAttempt(): Promise<void> {
	const fixture = await writtenIncompleteAttempt("transcript");

	const { series, cost } = await readSessionAttemptRequestSeries(fixture);

	expect(series.transcriptState).toBe("absent");
	expect(series.attemptTotals).toEqual({
		reasons: ["the attempt has no saved transcript"],
		state: "unavailable",
	});
	expect(cost.calculated).toEqual({
		reasons: ["the attempt has no saved transcript"],
		state: "unavailable",
	});
}

async function verifyReportsBoundaryUnknownWithTotalsUnavailableOnAnAttempt(): Promise<void> {
	const fixture = await writtenIncompleteAttempt("boundary");

	const { series, cost } = await readSessionAttemptRequestSeries(fixture);

	expect(series.boundary).toBe("unknown");
	expect(series.entries.map(({ region }) => region)).toEqual([
		"boundary-unknown",
	]);
	expect(series.attemptTotals).toEqual({
		reasons: ["the transcript carries no attempt boundary"],
		state: "unavailable",
	});
	expect(cost.calculated).toEqual({
		reasons: ["the transcript carries no attempt boundary"],
		state: "unavailable",
	});
}
