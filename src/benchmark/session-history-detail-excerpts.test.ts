import { describe, expect, it } from "bun:test";

import {
	MAX_EVENT_DETAIL_BYTES,
	sessionHistoryDetail,
} from "#benchmark/session-history";

import { call, result, row } from "./session-history-event-test-fixtures";
import { sessionAttempt } from "./session-history-test-identities";

const SHARED_DETAIL_SOURCE_COUNT = 2;

const UTF8_BOUNDARY_PREFIX_BYTE_OFFSET = 1;

const unicodeHalfBudget = MAX_EVENT_DETAIL_BYTES / SHARED_DETAIL_SOURCE_COUNT;

const unicodeDelivered = `${"a".repeat(unicodeHalfBudget - UTF8_BOUNDARY_PREFIX_BYTE_OFFSET)}€tail`;

const unicodeSnapshot = `${"b".repeat(unicodeHalfBudget - UTF8_BOUNDARY_PREFIX_BYTE_OFFSET)}€tail`;

const unicodeTranscript = [
	row(call("read-1", "Read", { file_path: "/work/CLAUDE.md" })),
	row(result("read-1", unicodeDelivered, { snapshot: unicodeSnapshot })),
].join("\n");

const unicodeInput = {
	attempt: sessionAttempt,
	prefixLinesExcluded: 0,
	resolvedCorpusFiles: [],
	transcript: unicodeTranscript,
} as const;

function sharesOneUnicodeSafeByteBudgetBetweenDeliveryAndSnapshot(): void {
	const detail = sessionHistoryDetail(unicodeInput, "2:1");
	if (detail === undefined) {
		throw new Error("Expected selected Read detail");
	}

	expect(detail.applicationTruncated).toBe(true);
	expect(detail.deliveredText).toBe(
		"a".repeat(unicodeHalfBudget - UTF8_BOUNDARY_PREFIX_BYTE_OFFSET),
	);
	expect(detail.sourceSnapshot).toBe(
		"b".repeat(unicodeHalfBudget - UTF8_BOUNDARY_PREFIX_BYTE_OFFSET),
	);
	expect(
		Buffer.byteLength(detail.deliveredText ?? "", "utf8") +
			Buffer.byteLength(detail.sourceSnapshot ?? "", "utf8"),
	).toBeLessThanOrEqual(MAX_EVENT_DETAIL_BYTES);
	expect(unicodeDelivered.startsWith(detail.deliveredText ?? "missing")).toBe(
		true,
	);
	expect(unicodeSnapshot.startsWith(detail.sourceSnapshot ?? "missing")).toBe(
		true,
	);
}

function marksAnIncompleteStructuredReadLineRangeAsPartialCoverage(): void {
	const transcript = [
		row(call("read-1", "Read", { file_path: "/work/CLAUDE.md" })),
		row(
			result("read-1", "delivered", {
				numLines: 1,
				snapshot: "middle line",
				startLine: 3,
				totalLines: 8,
			}),
		),
	].join("\n");
	const detail = sessionHistoryDetail(
		{
			attempt: sessionAttempt,
			prefixLinesExcluded: 0,
			resolvedCorpusFiles: [],
			transcript,
		},
		"2:1",
	);

	expect(detail?.snapshotMeasurement).toEqual({
		observedCharacters: 11,
		reasons: ["source snapshot is a partial line range"],
		state: "partial",
	});
	expect(detail?.sourceSnapshotRange).toEqual({
		coverage: "partial",
		deliveredLineCount: 1,
		startLine: 3,
		totalLineCount: 8,
	});
}

describe(sessionHistoryDetail.name, () => {
	it(
		"shares one Unicode-safe byte budget between delivery and snapshot",
		sharesOneUnicodeSafeByteBudgetBetweenDeliveryAndSnapshot,
	);
	it(
		"marks an incomplete structured Read line range as partial coverage",
		marksAnIncompleteStructuredReadLineRangeAsPartialCoverage,
	);
});
