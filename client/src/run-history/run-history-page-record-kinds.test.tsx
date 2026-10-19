import { describe, expect, it } from "bun:test";

import { within } from "@testing-library/react";

import recordMoment from "./record-moment";
import RunHistoryPage from "./run-history-page";
import RecordKindsHistoryBuilder from "./run-history-page-record-kinds-builder";
import { cellOf } from "./run-history-page-test-driver";
import {
	registerRunHistoryTestCleanup,
	renderPage,
	respondingWith,
} from "./run-history-page-test-harness";

const everyKind = new RecordKindsHistoryBuilder().build();

const RECORD_CONTEXT_LINKS = [
	[
		"replay",
		"2026-09-06T22-33-15.057Z",
		"/replays/60758c/2026-09-06T22-33-15.057Z",
	],
	[
		"session attempt",
		"0f6b6f2a-0000-4000-8000-000000000001",
		"/attempts/session/brief-reply/0f6b6f2a-0000-4000-8000-000000000001",
	],
] as const;

async function testOpensASavedStageFromTheCaseCellAndAGroupFromItsId(): Promise<void> {
	respondingWith(everyKind);

	await renderPage().findByText("group-a");

	expect(
		within(
			cellOf({ column: "Case", run: "2026-09-06T21-58-29.508Z" }),
		).getByRole("link", { name: "shape" }),
	).toHaveAttribute("href", "/runs/2026-09-06T21-58-29.508Z/stages/shape");
	expect(
		within(cellOf({ column: "Run", run: "group-a" })).getByRole("link"),
	).toHaveAttribute("href", "/groups/group-a");
}

async function testNamesWhatCannotBeOpenedAndWhyAsTextRatherThanALink(): Promise<void> {
	respondingWith(everyKind);

	await renderPage().findByText("group-a");

	const failed = cellOf({ column: "Case", run: "2026-09-17T12-50-49.127Z" });
	expect(failed).toHaveTextContent("case not recorded");
	expect(failed).toHaveTextContent("shape · failed before saving its context");
	expect(within(failed).queryByRole("link")).not.toBeInTheDocument();
	expect(
		within(cellOf({ column: "Run", run: "group-a" })).getByRole("link"),
	).toHaveAttribute("href", "/groups/group-a");
}

async function testNamesAReplayNoShortIdNamesByItsStageAlone(): Promise<void> {
	respondingWith(everyKind);

	await renderPage().findByText("group-a");

	expect(
		cellOf({ column: "Case", run: "2026-09-06T22-33-15.057Z" }),
	).toHaveTextContent(/replay shape(?! ·)/u);
}

async function testSaysARecordSTimeIsNotRecordedWhereItsRecordHoldsNone(): Promise<void> {
	respondingWith(everyKind);

	await renderPage().findByText("group-a");

	expect(
		cellOf({ column: "Run", run: "0f6b6f2a-0000-4000-8000-000000000001" }),
	).toHaveTextContent("time not recorded");
	expect(cellOf({ column: "Run", run: "group-a" })).toHaveTextContent(
		"time not recorded",
	);
	expect(
		cellOf({ column: "Run", run: "2026-09-06T22-33-15.057Z" }),
	).not.toHaveTextContent("time not recorded");
}

async function testSaysWhenASessionAttemptOrGroupStartedWhereItsRecordHoldsTheTime(): Promise<void> {
	respondingWith({
		...everyKind,
		rows: everyKind.rows.map((row) =>
			row.kind === "session-attempt" || row.kind === "group"
				? { ...row, startedAt: "2026-10-08T10:15:00.000Z" }
				: row,
		),
	});

	await renderPage().findByText("group-a");

	const started = recordMoment(
		Date.parse("2026-10-08T10:15:00.000Z"),
		Date.now(),
	);
	expect(
		cellOf({ column: "Run", run: "0f6b6f2a-0000-4000-8000-000000000001" }),
	).toHaveTextContent(started);
	expect(cellOf({ column: "Run", run: "group-a" })).toHaveTextContent(started);
}

async function testLinksRecordedContext(
	_kind: string,
	identity: string,
	href: string,
): Promise<void> {
	respondingWith(everyKind);

	await renderPage().findByText("group-a");

	expect(
		within(cellOf({ column: "Run", run: identity })).getByRole("link", {
			name: identity,
		}),
	).toHaveAttribute("href", href);
}

registerRunHistoryTestCleanup();

describe(RunHistoryPage.name, () => {
	describe("when the report lists every kind of saved record", () => {
		it.each(RECORD_CONTEXT_LINKS)(
			"opens a %s's context from its id",
			testLinksRecordedContext,
		);
		it(
			"opens a saved stage from the case cell and a group from its id",
			testOpensASavedStageFromTheCaseCellAndAGroupFromItsId,
		);
		it(
			"names what cannot be opened and why, as text rather than a link",
			testNamesWhatCannotBeOpenedAndWhyAsTextRatherThanALink,
		);
		it(
			"names a replay no short id names by its stage alone",
			testNamesAReplayNoShortIdNamesByItsStageAlone,
		);
		it(
			"says a record's time is not recorded where its record holds none",
			testSaysARecordSTimeIsNotRecordedWhereItsRecordHoldsNone,
		);
		it(
			"says when a session attempt or group started where its record holds the time",
			testSaysWhenASessionAttemptOrGroupStartedWhereItsRecordHoldsTheTime,
		);
	});
});
