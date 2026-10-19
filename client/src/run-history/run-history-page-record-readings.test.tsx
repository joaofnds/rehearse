import { describe, expect, it } from "bun:test";

import { fireEvent, screen } from "@testing-library/react";

import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";

import RunHistoryPage from "./run-history-page";
import RecordKindsHistoryBuilder from "./run-history-page-record-kinds-builder";
import { cellOf } from "./run-history-page-test-driver";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";

const everyKind = new RecordKindsHistoryBuilder().build();

const RECORD_EXECUTION_OUTCOMES = [
	["replay", "2026-09-06T22-33-15.057Z", "STOP"],
	["session attempt", "0f6b6f2a-0000-4000-8000-000000000001", "unsuccessful"],
	["pipeline run", "2026-09-17T12-50-49.127Z", "interrupted"],
] as const;

async function testNamesOnEveryKindOfRowTheCorpusVersionItsRecordMeasuredTheRefusalOrThatNoneWasRecorded(): Promise<void> {
	const measured = {
		group: { digest: "d".repeat(SHA256_HEX_CHARACTERS), kind: "version" },
		replay: { kind: "refused", refusal: "a symlink escapes the root" },
		"session-attempt": {
			digest: "c".repeat(SHA256_HEX_CHARACTERS),
			kind: "version",
		},
	} as const;
	respondingWith({
		...everyKind,
		rows: everyKind.rows.map((row) =>
			row.kind === "run" ? row : { ...row, corpusVersion: measured[row.kind] },
		),
	});

	await renderPage().findByText("group-a");

	expect(
		cellOf({ column: "Corpus", run: "2026-09-17T12-50-49.127Z" }),
	).toHaveTextContent("version not recorded");
	expect(
		cellOf({ column: "Corpus", run: "2026-09-06T22-33-15.057Z" }),
	).toHaveTextContent("refused: a symlink escapes the root");
	expect(
		cellOf({ column: "Corpus", run: "0f6b6f2a-0000-4000-8000-000000000001" }),
	).toHaveTextContent("corpus@cccccc");
	expect(cellOf({ column: "Corpus", run: "group-a" })).toHaveTextContent(
		"corpus@dddddd",
	);
}

async function testCountsEveryListedRecordOnTheAllPillAndTheSubline(): Promise<void> {
	respondingWith(everyKind);

	renderPage();

	expect(
		await screen.findByRole("button", { name: "All 5" }),
	).toBeInTheDocument();
	expect(
		screen.getByText("5 readable entries · 5 records · 0 launches"),
	).toBeInTheDocument();
}

async function testKeepsFilterDefinitionsAndRetainedHistoryMeaningAvailableOnRequest(): Promise<void> {
	respondingWith(everyKind);

	await renderPage().findByText("group-a");

	fireEvent.click(
		screen.getByRole("button", { name: "How filters and counts work" }),
	);
	expect(
		screen.getByText(
			/Stale records retain their recorded grades after the corpus changes/u,
		),
	).toBeInTheDocument();
}

async function testKeepsStoppedMeaningAPipelineRunWithAStoppedStageSoASTOPVerdictDoesNotMatch(): Promise<void> {
	respondingWith(everyKind);
	await renderPage().findByText("group-a");

	fireEvent.click(screen.getByRole("button", { name: "Stopped" }));

	expect(screen.getByText("2026-09-06T21-58-29.508Z")).toBeInTheDocument();
	for (const identity of [
		"2026-09-17T12-50-49.127Z",
		"2026-09-06T22-33-15.057Z",
		"0f6b6f2a-0000-4000-8000-000000000001",
		"group-a",
	]) {
		expect(screen.queryByText(identity)).not.toBeInTheDocument();
	}
}

async function testShowsRecordedOutcome(
	_kind: string,
	identity: string,
	outcome: string,
): Promise<void> {
	respondingWith(everyKind);

	await renderPage().findByText("group-a");

	expect(cellOf({ column: "Outcome", run: identity })).toHaveTextContent(
		outcome,
	);
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("when the report lists every kind of saved record", () => {
		it.each(RECORD_EXECUTION_OUTCOMES)(
			"shows a %s's outcome",
			testShowsRecordedOutcome,
		);
		it(
			"names on every kind of row the corpus version its record measured, the refusal, or that none was recorded",
			testNamesOnEveryKindOfRowTheCorpusVersionItsRecordMeasuredTheRefusalOrThatNoneWasRecorded,
		);
		it(
			"counts every listed record on the All pill and the subline",
			testCountsEveryListedRecordOnTheAllPillAndTheSubline,
		);
		it(
			"keeps filter definitions and retained-history meaning available on request",
			testKeepsFilterDefinitionsAndRetainedHistoryMeaningAvailableOnRequest,
		);
		it(
			"keeps Stopped meaning a pipeline run with a stopped stage, so a STOP verdict does not match",
			testKeepsStoppedMeaningAPipelineRunWithAStoppedStageSoASTOPVerdictDoesNotMatch,
		);
	});
});
