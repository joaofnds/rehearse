import { afterEach, describe, expect, it } from "bun:test";

import { screen } from "@testing-library/react";

import type { Immutable } from "#benchmark/contracts";
import { renderAppWithStub } from "#client/test-support/render-app";
import type { SessionAttemptRow } from "#server/run-history";

import type { AttemptEvidenceResponse } from "./attempt-evidence-query";
import { standaloneRow } from "./attempt-record-test-fixtures";
import AttemptWorkspacePage from "./attempt-workspace";
import { originalFetch, show } from "./attempt-workspace-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(AttemptWorkspacePage.name, () => {
	it(
		"names the case once when the saved attempt ID already includes it",
		namesTheCaseOnceWhenTheSavedAttemptIDAlreadyIncludesIt,
	);

	it(
		"advances standalone attempts from older to newer saved executions",
		advancesStandaloneAttemptsFromOlderToNewerSavedExecutions,
	);

	it(
		"shows one standalone outcome and check count when detailed session evidence is available",
		showsOneStandaloneOutcomeAndCheckCountWhenDetailedSessionEvidenceIsAvailable,
	);

	it.each([
		["unreadable", undefined],
		[
			"unavailable",
			{
				reason: "Detailed attempt evidence was not retained.",
				state: "unavailable",
			},
		],
	] as const)(
		"keeps the standalone row's checks and measurements when evidence is %s",
		keepsUnavailableEvidenceReadings,
	);

	it(
		"embeds saved context with a return to the same attempt's Results",
		embedsSavedContextWithAReturnToTheSameAttemptSResults,
	);
});

async function namesTheCaseOnceWhenTheSavedAttemptIDAlreadyIncludesIt(): Promise<void> {
	renderAppWithStub(
		"/attempts/session/case-a/attempt-a",
		new Map<string, unknown>([
			[
				"/api/runs",
				{
					launches: [],
					rows: [{ ...standaloneRow(), shortId: "case-a/r2" }],
					unreadable: [],
				},
			],
		]),
	);

	await screen.findByText("Attempt 1 of 1");
	expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
		"r2 · case-a",
	);
}

async function advancesStandaloneAttemptsFromOlderToNewerSavedExecutions(): Promise<void> {
	const older = standaloneRow();
	const newer = {
		...older,
		recordId: "attempt:session:case-a/attempt-b",
		shortId: "s02",
		startedAt: "2026-10-02T12:00:00Z",
		uuid: "attempt-b",
	};
	renderAppWithStub(
		"/attempts/session/case-a/attempt-a?view=results&comparison=related",
		new Map<string, unknown>([
			["/api/runs", { launches: [], rows: [newer, older], unreadable: [] }],
		]),
	);

	expect(await screen.findByText("Attempt 1 of 2")).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Previous attempt" }),
	).toBeDisabled();
	expect(screen.getByRole("link", { name: "Next attempt" })).toHaveAttribute(
		"href",
		"/attempts/session/case-a/attempt-b?view=results&comparison=related",
	);
}

async function showsOneStandaloneOutcomeAndCheckCountWhenDetailedSessionEvidenceIsAvailable(): Promise<void> {
	const expectedMatchingElementsCount = 1;

	const row: SessionAttemptRow = {
		...standaloneRow(),
		checks: { declared: 2, passed: 1, state: "available" },
	};
	show(
		{ caseId: "case-a", kind: "standalone", uuid: "attempt-a" },
		"results",
		new Map<string, unknown>([
			["/api/runs", { launches: [], rows: [row], unreadable: [] }],
			[
				"/api/attempt-evidence/attempt%3Asession%3Acase-a%2Fattempt-a",
				{
					kind: "session",
					record: {
						caseId: "case-a",
						checks: [
							{ detail: "Too short.", kind: "word-band", status: "FAIL" },
							{
								detail: "Allowed calls.",
								kind: "tool-calls",
								status: "PASS",
							},
						],
						outcome: "UNSUCCESSFUL",
						reply: "Saved reply",
					},
					state: "available",
				},
			],
		]),
	);

	await screen.findByRole("region", { name: "Session assessment" });
	expect(screen.getAllByText("Recorded outcome: UNSUCCESSFUL")).toHaveLength(
		expectedMatchingElementsCount,
	);
	expect(
		screen.getAllByText("1 of 2 reply/transcript checks passed"),
	).toHaveLength(expectedMatchingElementsCount);
	expect(screen.getByText("$0.37")).toBeInTheDocument();
}

async function embedsSavedContextWithAReturnToTheSameAttemptSResults(): Promise<void> {
	const expectedHeadingCount = 1;

	show(
		{ caseId: "case-a", kind: "standalone", uuid: "attempt-a" },
		"context",
		new Map([
			["/api/runs", { launches: [], rows: [standaloneRow()], unreadable: [] }],
		]),
	);
	expect(
		await screen.findByText("Context & cost · saved evidence"),
	).toBeTruthy();
	expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(
		expectedHeadingCount,
	);
	expect(
		screen.getByRole("link", { name: "Results" }).getAttribute("href"),
	).toBe("/attempts/session/case-a/attempt-a?view=results");

	// The record disclosure belongs to Results, where it is a secondary
	// source of complete evidence, not a second context timeline.
	expect(
		screen.queryByRole("button", { name: "Show saved record JSON" }),
	).toBeNull();
}

async function keepsUnavailableEvidenceReadings(
	_state: string,
	evidence: Immutable<AttemptEvidenceResponse> | undefined,
): Promise<void> {
	show(
		{ caseId: "case-a", kind: "standalone", uuid: "attempt-a" },
		"results",
		new Map<string, unknown>([
			["/api/runs", { launches: [], rows: [standaloneRow()], unreadable: [] }],
			[
				"/api/attempt-evidence/attempt%3Asession%3Acase-a%2Fattempt-a",
				evidence,
			],
		]),
	);

	expect(
		await screen.findByText("2 of 3 reply/transcript checks passed"),
	).toBeTruthy();
	expect(screen.getByText("Recorded outcome: UNSUCCESSFUL")).toBeTruthy();
	expect(
		screen.getByRole("heading", { name: "s01 · case-a" }),
	).toBeInTheDocument();
	expect(screen.getByText("$0.37")).toBeTruthy();
	expect(screen.getByText("01:12")).toBeTruthy();
	expect(screen.getByText("corpus@aaaaaa")).toBeTruthy();
	expect(
		screen.getByRole("link", { name: "Context & cost" }).getAttribute("href"),
	).toBe("/attempts/session/case-a/attempt-a?view=context");
}
