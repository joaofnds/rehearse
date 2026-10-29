import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { committedRateCatalog } from "#benchmark/rate-catalog";
import { sessionAttemptPaths } from "#benchmark/run-layout";
import {
	subagentAttemptRates,
	writtenSubagentAttempt,
} from "#server/session-history-agents-test-fixture";
import {
	writtenIncompleteAttempt,
	writtenResumedAttempt,
} from "#server/session-history-attempt-test-fixture";
import { readSessionAttemptRequestSeries } from "#server/session-history-reader";
import { clearSessionHistoryRoots } from "#server/session-history-workspace-test-fixture";

afterEach(clearSessionHistoryRoots);

/** The fixture's one sub-agent request, at subagentAttemptRates. */
const UNKEPT_SUBAGENT_COST_USD = 0.375;

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

	describe("sub-agent evidence", subagentEvidence);

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

function subagentEvidence(): void {
	describe("when the attempt kept its sub-agent's transcript", () => {
		it(
			"reads no remaining difference when the provider charged exactly every agent's requests",
			verifyReadsNoRemainingDifferenceWhenTheProviderChargedEveryAgent,
		);
	});

	describe("when the attempt launched no sub-agent", () => {
		it(
			"draws the remaining difference from the root's requests",
			verifyDrawsTheDifferenceFromTheRootsRequestsWithoutSubagents,
		);
	});

	describe("when the attempt did not keep its sub-agent's transcript", () => {
		it(
			"leaves the sub-agent's spend in an incomplete difference naming it",
			verifyLeavesTheUnkeptSubagentsSpendInAnIncompleteDifference,
		);
	});

	describe("when the sub-agents directory is refused", () => {
		it(
			"keeps the root series and reads the calculated attempt cost unavailable",
			verifyKeepsTheRootSeriesWhenTheSubagentsDirectoryIsRefused,
		);
	});
}

async function verifyDrawsTheDifferenceFromTheRootsRequestsWithoutSubagents(): Promise<void> {
	const fixture = await writtenResumedAttempt();

	const { cost } = await readSessionAttemptRequestSeries(
		fixture,
		committedRateCatalog,
	);

	expect(cost.rootRequests.state).toBe("complete");
	expect(cost.calculated).toEqual(cost.rootRequests);
}

async function verifyLeavesTheUnkeptSubagentsSpendInAnIncompleteDifference(): Promise<void> {
	const fixture = await writtenSubagentAttempt();
	const paths = sessionAttemptPaths(fixture.runsDirectory, fixture);
	await rm(join(paths.directory, "subagents", "agent-k1.jsonl"));

	const { cost } = await readSessionAttemptRequestSeries(
		fixture,
		subagentAttemptRates,
	);

	expect(cost.difference).toEqual({
		costUsd: UNKEPT_SUBAGENT_COST_USD,
		pricedRequestCount: 2,
		reasons: [
			"a reading it is drawn from is incomplete",
			"no transcript was kept for sub-agent k1",
		],
		requestCount: 2,
		state: "incomplete",
	});
}

async function verifyTotalsOnlyTheAttemptRegionOfAResumedSaved(): Promise<void> {
	const fixture = await writtenResumedAttempt();

	const { series } = await readSessionAttemptRequestSeries(
		fixture,
		committedRateCatalog,
	);

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

	const { instructionLoads } = await readSessionAttemptRequestSeries(
		fixture,
		committedRateCatalog,
	);

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

	const { instructionLoads } = await readSessionAttemptRequestSeries(
		fixture,
		committedRateCatalog,
	);

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

	const { cost } = await readSessionAttemptRequestSeries(
		fixture,
		committedRateCatalog,
	);

	expect(cost.reported).toEqual({ costUsd: 1.008294, state: "complete" });
}

async function verifyReadsNoRemainingDifferenceWhenTheProviderChargedEveryAgent(): Promise<void> {
	const fixture = await writtenSubagentAttempt();

	const { cost } = await readSessionAttemptRequestSeries(
		fixture,
		subagentAttemptRates,
	);

	expect(cost.difference).toEqual({ costUsd: 0, state: "complete" });
}

async function verifyKeepsTheRootSeriesWhenTheSubagentsDirectoryIsRefused(): Promise<void> {
	const fixture = await writtenSubagentAttempt();
	const paths = sessionAttemptPaths(fixture.runsDirectory, fixture);
	const outside = await mkdtemp(join(tmpdir(), "rehearse-outside-"));
	await rm(join(paths.directory, "subagents"), { recursive: true });
	await symlink(outside, join(paths.directory, "subagents"));

	const { cost, series } = await readSessionAttemptRequestSeries(
		fixture,
		subagentAttemptRates,
	);

	expect(series.boundary).toBe("known");
	expect(cost.calculated).toEqual({
		reasons: ["the attempt's sub-agent files were refused"],
		state: "unavailable",
	});
}

async function verifyReportsTotalsUnavailableRatherThanZeroWhenTheAttempt(): Promise<void> {
	const fixture = await writtenIncompleteAttempt("transcript");

	const { series, cost } = await readSessionAttemptRequestSeries(
		fixture,
		committedRateCatalog,
	);

	expect(series.transcriptState).toBe("absent");
	expect(series.attemptTotals).toEqual({
		reasons: ["the attempt has no saved transcript"],
		state: "unavailable",
	});
	expect(cost.calculated).toEqual({
		reasons: ["the attempt has no saved transcript"],
		state: "unavailable",
	});
	expect(cost.difference).toEqual({
		reasons: ["the calculated reading is unavailable"],
		state: "unavailable",
	});
}

async function verifyReportsBoundaryUnknownWithTotalsUnavailableOnAnAttempt(): Promise<void> {
	const fixture = await writtenIncompleteAttempt("boundary");

	const { series, cost } = await readSessionAttemptRequestSeries(
		fixture,
		committedRateCatalog,
	);

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
