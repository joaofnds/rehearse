import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import {
	OTHER_COHORT_DIGEST,
	disputedStateCase,
	multiCohortCase,
} from "./case-cohort-fixtures";
import {
	DIGEST,
	card,
	originalFetch,
	renderCasesAt,
	sessionCase,
} from "./case-page-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("recorded corpus cohorts", corpusCohortSelection);

it(
	"shows an unknown corpus selection without substituting another cohort",
	showsAnUnknownCorpusSelectionWithoutSubstitutingAnotherCohort,
);

it(
	"uses saved short IDs and attempt positions for case cohort member labels",
	usesSavedShortIDsAndAttemptPositionsForCaseCohortMemberLabels,
);

it(
	"shows recorded reply success beside failed saved state and keeps legacy state unavailable",
	showsRecordedReplySuccessBesideFailedSavedStateAndKeepsLegacyStateUnavailable,
);

function corpusCohortSelection(): void {
	beforeEach(async () => {
		renderCasesAt("/cases", { cases: [multiCohortCase()] });
		fireEvent.click(
			within(await card("brief-reply")).getByRole("link", {
				name: "brief-reply",
			}),
		);
		await screen.findByRole("region", { name: "Prompt" });
	});
	it(
		"reads the selected definition and its exact current cohort",
		readsCurrentCaseCohort,
	);
	it(
		"switches to an unassessed cohort without substituting measurements",
		readsSelectedUnassessedCohort,
	);
	it("opens a one-attempt launch from the cohort", opensCohortLaunch);
}
async function readsCurrentCaseCohort(): Promise<void> {
	expect(
		await screen.findByRole("region", { name: "Prompt" }),
	).toHaveTextContent("Write a concise answer about the saved evidence.");
	expect(
		screen.getByRole("region", { name: "Evaluation contract" }),
	).toHaveTextContent('"max":120');
	expect(screen.getByRole("link", { name: "Session first" })).toHaveAttribute(
		"href",
		"/attempts/session/brief-reply/first",
	);
	expect(
		screen.queryByRole("link", { name: "Session other" }),
	).not.toBeInTheDocument();
}
async function readsSelectedUnassessedCohort(): Promise<void> {
	const otherDigest = OTHER_COHORT_DIGEST;
	fireEvent.change(screen.getByRole("combobox", { name: "Corpus cohort" }), {
		target: { value: otherDigest },
	});
	expect(
		await screen.findByRole("link", { name: "Session other" }),
	).toBeInTheDocument();
	expect(
		screen.queryByRole("link", { name: "Session first" }),
	).not.toBeInTheDocument();
	expect(screen.getByText("1 unassessed of 1 run")).toBeInTheDocument();
	expect(
		screen.getByText("0 costed; 1 without a complete cost"),
	).toBeInTheDocument();
	expect(
		screen.getByRole("region", { name: "Run evidence by corpus" }),
	).toHaveTextContent("Unavailable");
}
async function opensCohortLaunch(): Promise<void> {
	fireEvent.change(screen.getByRole("combobox", { name: "Corpus cohort" }), {
		target: { value: OTHER_COHORT_DIGEST },
	});
	await screen.findByRole("link", { name: "Session other" });
	expect(screen.getByRole("button", { name: "Run once" })).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Run once" }));
	const launch = await screen.findByRole("dialog");
	await waitFor(() => {
		expect(within(launch).getByLabelText("Case")).toHaveValue("brief-reply");
	});
	expect(within(launch).getByRole("button", { name: "×1" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
}

async function showsAnUnknownCorpusSelectionWithoutSubstitutingAnotherCohort(): Promise<void> {
	renderCasesAt(
		"/cases?caseId=brief-reply&corpusVersion=not-a-recorded-version",
		{
			cases: [
				sessionCase({
					cohorts: [
						{
							corpusVersion: DIGEST,
							figures: { state: "no-runs" },
							members: [],
						},
					],
				}),
			],
		},
	);
	expect(
		await screen.findByText(
			"No recorded cohort matches this corpus selection. Choose a recorded version.",
		),
	).toBeInTheDocument();
	expect(screen.queryByRole("table")).not.toBeInTheDocument();
}

async function usesSavedShortIDsAndAttemptPositionsForCaseCohortMemberLabels(): Promise<void> {
	const groupId = "01234567-0000-4000-8000-000000000000";
	const repId = "98765432-0000-4000-8000-000000000000";
	const label = `${groupId} · ${repId}`;
	const href = `/groups/${groupId}/reps/${repId}/attempt`;
	renderCasesAt("/cases?caseId=brief-reply", {
		additional: new Map([
			[
				"/api/run-listing",
				{
					launches: [],
					rows: [
						{
							caseId: "brief-reply",
							groupId,
							kind: "group",
							repAttempts: [{ attempt: { count: 6, position: 2 }, repId }],
							shortId: "brief-reply/g7",
						},
					],
					unreadable: [],
				},
			],
		]),
		cases: [
			sessionCase({
				cohorts: [
					{
						corpusVersion: DIGEST,
						figures: { state: "no-runs" },
						members: [
							{
								href,
								label,
								run: { corpusDigest: DIGEST, costUsd: undefined, passed: true },
								startedAt: null,
							},
						],
					},
				],
			}),
		],
		problems: {},
	});
	const member = await screen.findByRole("link", {
		name: "g7 · attempt 2 of 6",
	});
	expect(member).toHaveAttribute("href", href);
	expect(member).toHaveAttribute("title", label);
}

async function showsRecordedReplySuccessBesideFailedSavedStateAndKeepsLegacyStateUnavailable(): Promise<void> {
	renderCasesAt("/cases?caseId=brief-reply", { cases: [disputedStateCase()] });
	const table = await screen.findByRole("table", {
		name: "Runs in the selected cohort",
	});
	const disputed = within(table).getByRole("row", {
		name: /Session disputed/u,
	});
	expect(disputed).toHaveTextContent("Recorded successful");
	expect(disputed).toHaveTextContent("Reply/transcript: 1 of 1 passed");
	expect(disputed).toHaveTextContent("Saved state: 18 of 19 failed");
	expect(disputed).toHaveTextContent("Assessment layers disagree");
	const legacy = within(table).getByRole("row", { name: /Session legacy/u });
	expect(legacy).toHaveTextContent("Saved state unavailable");
	expect(within(legacy).getByText("Saved state unavailable")).toHaveAttribute(
		"title",
		"No saved state assessment was recorded; declaration is unknown.",
	);
}
