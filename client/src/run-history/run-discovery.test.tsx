import { afterEach, describe, expect, it } from "bun:test";

import { screen, within } from "@testing-library/react";

import { runHistoryReplies } from "#client/test-support/fetch-stub";
import { renderAppWithStub } from "#client/test-support/render-app";
import {
	UNREAD_REPLAY_FIGURES,
	UNREAD_RUN_FIGURES,
	UNREAD_SESSION_ATTEMPT_FIGURES,
} from "#client/test-support/run-figures";
import type { ReplayRow, SessionAttemptRow } from "#server/run-history";

import { matchesDiscovery } from "./run-discovery";
import {
	NO_QUALITY_FAILURES,
	QUALITY_FAILURE_COUNT,
	group,
	originalFetch,
	run,
	stopped,
} from "./run-discovery-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

async function includesStoppedStepsOnlyWhenTheirRecordedGradeFallsBelowTheRunSOwnMinimum(): Promise<void> {
	const expectedRowCount = 2;
	renderAppWithStub(
		"/?status=failed",
		runHistoryReplies({
			launches: [],
			rows: [
				stopped("below-high-minimum", {
					letter: "A",
					minimum: "A+",
					reachesMinimum: false,
				}),
				stopped("above-low-minimum", {
					letter: "C",
					minimum: "D",
					reachesMinimum: true,
				}),
				{ ...run("unjudged-stop"), status: "STOPPED:build" },
				{
					...stopped("missing-minimum", {
						letter: "A",
						minimum: "A+",
						reachesMinimum: false,
					}),
					minimumGrade: UNREAD_RUN_FIGURES.minimumGrade,
				},
			],
			unreadable: [],
		}),
	);
	const table = await screen.findByRole("table", { name: "Run history" });
	expect(within(table).getAllByRole("row")).toHaveLength(expectedRowCount);
	expect(within(table).getByText("below-high-minimum")).toBeInTheDocument();
}

async function findsFailedStageAndSessionGroupsWithoutClassifyingUnjudgedErrorsAsQualityFailures(): Promise<void> {
	const expectedRowCount = 3;
	renderAppWithStub(
		"/?status=failed&kind=group",
		runHistoryReplies({
			launches: [],
			rows: [
				group("stage-failure", "stage", QUALITY_FAILURE_COUNT),
				group("checks-failure", "session", QUALITY_FAILURE_COUNT),
				group("missing-judgment", "stage", NO_QUALITY_FAILURES),
			],
			unreadable: [],
		}),
	);
	const table = await screen.findByRole("table", { name: "Run history" });
	expect(within(table).getAllByRole("row")).toHaveLength(expectedRowCount);
	expect(within(table).getByText("stage-failure")).toBeInTheDocument();
	expect(within(table).getByText("checks-failure")).toBeInTheDocument();
	expect(within(table).queryByText("missing-judgment")).not.toBeInTheDocument();
}

describe("discovering saved runs and attempts", () => {
	it.each([
		["SUCCESSFUL", false, true],
		["UNSUCCESSFUL", true, false],
		["NO_REPLY", false, false],
		["EXECUTION_FAILED", false, false],
	] as const)(
		"separates session %s quality from execution gaps",
		classifiesSessionQuality,
	);
	it.each([
		["STOP", true, false],
		["CONTINUE", false, true],
	] as const)(
		"classifies replay %s from its recorded verdict",
		classifiesReplayQuality,
	);
	it(
		"includes stopped steps only when their recorded grade falls below the run's own minimum",
		includesStoppedStepsOnlyWhenTheirRecordedGradeFallsBelowTheRunSOwnMinimum,
	);
	it(
		"finds failed stage and session groups without classifying unjudged errors as quality failures",
		findsFailedStageAndSessionGroupsWithoutClassifyingUnjudgedErrorsAsQualityFailures,
	);
});

function classifiesSessionQuality(
	status: SessionAttemptRow["status"],
	failed: boolean,
	passed: boolean,
): void {
	const row: SessionAttemptRow = {
		...UNREAD_SESSION_ATTEMPT_FIGURES,
		caseId: "case",
		corpusVersion: undefined,
		kind: "session-attempt",
		links: [],
		recordId: "attempt:session:case:uuid",
		shortId: undefined,
		staleness: run("reference").staleness,
		status,
		uuid: "uuid",
	};

	expect(matchesDiscovery(row, { status: "failed" })).toBe(failed);
	expect(matchesDiscovery(row, { status: "passed" })).toBe(passed);
	expect(matchesDiscovery(row, { status: "ended" })).toBe(true);
}

function classifiesReplayQuality(
	status: ReplayRow["status"],
	failed: boolean,
	passed: boolean,
): void {
	const row: ReplayRow = {
		...UNREAD_REPLAY_FIGURES,
		attempt: undefined,
		caseId: "case",
		checkpointShortId: undefined,
		corpusVersion: undefined,
		grade: "C",
		kind: "replay",
		lineage: "lineage",
		links: [],
		recordId: "attempt:stage:lineage:timestamp",
		shortId: undefined,
		stage: "build",
		staleness: run("reference").staleness,
		status,
		timestamp: "timestamp",
	};

	expect(matchesDiscovery(row, { status: "failed" })).toBe(failed);
	expect(matchesDiscovery(row, { status: "passed" })).toBe(passed);
}
