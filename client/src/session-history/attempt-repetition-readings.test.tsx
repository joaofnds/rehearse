import { afterEach, describe, expect, it } from "bun:test";

import { screen } from "@testing-library/react";

import {
	DETAILED_SESSION_REPETITION,
	MEASURED_SESSION_REPETITION,
	workflowRep,
} from "./attempt-record-test-fixtures";
import AttemptWorkspacePage from "./attempt-workspace";
import { originalFetch, show } from "./attempt-workspace-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(AttemptWorkspacePage.name, () => {
	it(
		"shows unavailable cost when a rep recorded no provider calls",
		showsUnavailableCostWhenARepRecordedNoProviderCalls,
	);

	it(
		"keeps repetition measurements unavailable when the saved-result request fails",
		keepsRepetitionMeasurementsUnavailableWhenTheSavedResultRequestFails,
	);

	it(
		"shows one confirmation session outcome and keeps its measurements beside detailed assessment",
		showsOneConfirmationSessionOutcomeAndKeepsItsMeasurementsBesideDetailedAssessment,
	);

	it(
		"shows a confirmation rep's own cost and elapsed time, never group totals",
		showsAConfirmationRepSOwnCostAndElapsedTimeNeverGroupTotals,
	);

	it(
		"labels a missing individual rep record without borrowing group totals",
		labelsAMissingIndividualRepRecordWithoutBorrowingGroupTotals,
	);
});

async function showsUnavailableCostWhenARepRecordedNoProviderCalls(): Promise<void> {
	show(
		{ groupId: "group-a", kind: "confirmation", repId: "group-a-rep-1" },
		"results",
		new Map([
			[
				"/api/groups/group-a/reps/group-a-rep-1/attempt/result",
				{
					...workflowRep("stage"),
					metrics: {
						calls: [],
						missing: ["worker metrics absent"],
						status: "MISSING",
					},
				},
			],
		]),
	);
	expect(
		await screen.findByText("Unavailable: no call metrics recorded"),
	).toBeInTheDocument();
	expect(screen.queryByText(/\$0\.00/u)).not.toBeInTheDocument();
}

async function keepsRepetitionMeasurementsUnavailableWhenTheSavedResultRequestFails(): Promise<void> {
	show(
		{ groupId: "group-a", kind: "confirmation", repId: "group-a-rep-1" },
		"results",
		new Map(),
	);

	expect(await screen.findByRole("alert")).toHaveTextContent(
		"Individual rep result unavailable",
	);
	expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
}

async function showsOneConfirmationSessionOutcomeAndKeepsItsMeasurementsBesideDetailedAssessment(): Promise<void> {
	const expectedMatchingElementsCount = 1;
	show(
		{ groupId: "group-a", kind: "confirmation", repId: "group-a-rep-1" },
		"results",
		new Map<string, unknown>([
			[
				"/api/groups/group-a/reps/group-a-rep-1/attempt/result",
				DETAILED_SESSION_REPETITION,
			],
			[
				"/api/attempt-evidence/rep%3Asession%3Agroup-a%2Fgroup-a-rep-1",
				{
					kind: "session",
					record: {
						caseId: "case-a",
						checks: [
							{
								detail: "Allowed calls.",
								kind: "tool-calls",
								status: "PASS",
							},
						],
						outcome: "SUCCESSFUL",
						reply: "Saved reply",
					},
					state: "available",
				},
			],
		]),
	);

	await screen.findByRole("region", { name: "Session assessment" });
	expect(screen.getAllByText("Recorded outcome: SUCCESSFUL")).toHaveLength(
		expectedMatchingElementsCount,
	);
	expect(
		screen.getAllByText("1 of 1 reply/transcript checks passed"),
	).toHaveLength(expectedMatchingElementsCount);
	expect(
		screen.queryByText("Reply/transcript checks passed"),
	).not.toBeInTheDocument();
	expect(screen.getByText("$0.04")).toBeInTheDocument();
}

async function showsAConfirmationRepSOwnCostAndElapsedTimeNeverGroupTotals(): Promise<void> {
	show(
		{ groupId: "group-a", kind: "confirmation", repId: "group-a-rep-1" },
		"results",
		new Map<string, unknown>([
			[
				"/api/runs",
				{
					launches: [],
					rows: [
						{
							cost: { state: "available", usd: 99 },
							groupId: "group-a",
							kind: "group",
							wallTime: { ms: 999_000, state: "available" },
						},
					],
					unreadable: [],
				},
			],
			[
				"/api/groups/group-a/reps/group-a-rep-1/attempt/result",
				MEASURED_SESSION_REPETITION,
			],
		]),
	);

	expect(await screen.findByText("$0.02")).toBeTruthy();
	expect(screen.getByText("00:12")).toBeTruthy();
	expect(screen.getByText("Reply/transcript checks passed")).toBeTruthy();
	expect(screen.queryByText("$99.00")).toBeNull();
	expect(
		screen.getByRole("link", { name: "Group results" }).getAttribute("href"),
	).toBe("/groups/group-a?view=attempts");
}

async function labelsAMissingIndividualRepRecordWithoutBorrowingGroupTotals(): Promise<void> {
	show(
		{ groupId: "group-a", kind: "confirmation", repId: "group-a-rep-2" },
		"results",
		new Map([
			[
				"/api/runs",
				{
					launches: [],
					rows: [
						{
							cost: { state: "available", usd: 99 },
							groupId: "group-a",
							kind: "group",
							wallTime: { ms: 999_000, state: "available" },
						},
					],
					unreadable: [],
				},
			],
		]),
	);

	expect(
		await screen.findByText(
			"Individual rep result unavailable from its saved record.",
		),
	).toBeTruthy();
	expect(screen.queryByText("$99.00")).toBeNull();
	expect(screen.queryByText("16:39")).toBeNull();
}
