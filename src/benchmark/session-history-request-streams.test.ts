import { describe, expect, it } from "bun:test";

import {
	sessionHistoryRequestSeries,
	sessionHistoryRequestSeriesFromLines,
} from "#benchmark/session-history";

import HistoryLineFiles from "./session-history-line-files-test-fixtures";
import { multiRequestTranscript } from "./session-history-request-test-fixtures";

const files = HistoryLineFiles.forEachTest();

async function buildsTheSameSeriesTheStringInputBuilds(): Promise<void> {
	const streamed = await sessionHistoryRequestSeriesFromLines(
		{ prefixLinesExcluded: 1 },
		await files.linesOf(`${multiRequestTranscript}\n`),
	);

	expect(streamed).toEqual(
		sessionHistoryRequestSeries({
			prefixLinesExcluded: 1,
			transcript: multiRequestTranscript,
		}),
	);
}

async function readsAFinalLineCarryingNoTrailingNewlineAsTheSameEntry(): Promise<void> {
	const withoutNewline = await sessionHistoryRequestSeriesFromLines(
		{ prefixLinesExcluded: 1 },
		await files.linesOf(multiRequestTranscript),
	);

	expect(withoutNewline.entries).toEqual(
		sessionHistoryRequestSeries({
			prefixLinesExcluded: 1,
			transcript: multiRequestTranscript,
		}).entries,
	);
}

async function readsATranscriptWrittenWithCarriageReturnLineEndings(): Promise<void> {
	const crlf = await files.linesOf(
		`${multiRequestTranscript.replaceAll("\n", "\r\n")}\r\n`,
	);

	const streamed = await sessionHistoryRequestSeriesFromLines(
		{ prefixLinesExcluded: 1 },
		crlf,
	);

	expect(streamed.entries).toEqual(
		sessionHistoryRequestSeries({
			prefixLinesExcluded: 1,
			transcript: multiRequestTranscript,
		}).entries,
	);
}

async function countsAnEmptySavedTranscriptAsZeroRequestsNotAsAnAbsentOne(): Promise<void> {
	const series = await sessionHistoryRequestSeriesFromLines(
		{ prefixLinesExcluded: 1268 },
		await files.linesOf(""),
	);

	expect(series.transcriptState).toBe("saved");
	expect(series.entries).toEqual([]);
	expect(series.attemptTotals).toEqual({
		requestCount: 0,
		state: "complete",
		totalInputTokens: 0,
		usage: {
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			inputTokens: 0,
			outputTokens: 0,
		},
	});
}

describe(sessionHistoryRequestSeries.name, () => {
	describe("when the transcript arrives as lines", () => {
		it(
			"builds the same series the string input builds",
			buildsTheSameSeriesTheStringInputBuilds,
		);
		it(
			"reads a final line carrying no trailing newline as the same entry",
			readsAFinalLineCarryingNoTrailingNewlineAsTheSameEntry,
		);
		it(
			"reads a transcript written with carriage-return line endings",
			readsATranscriptWrittenWithCarriageReturnLineEndings,
		);
		it(
			"counts an empty saved transcript as zero requests, not as an absent one",
			countsAnEmptySavedTranscriptAsZeroRequestsNotAsAnAbsentOne,
		);
	});
});
