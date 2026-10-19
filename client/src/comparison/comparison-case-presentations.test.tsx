import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import { pipelinePairingComparison } from "./comparison-assessment-fixtures";
import { ComparisonPage } from "./comparison-page";
import {
	DIGEST,
	comparisonResponseBody,
	originalFetch,
	renderPage,
} from "./comparison-page-test-fixtures";
import { PASSED_EVERY_ATTEMPT } from "./comparison-report-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(ComparisonPage.name, () => {
	it(
		"draws each case's attempts with what the pairing says and why to read it with care",
		drawsEachCaseSAttemptsWithWhatThePairingSaysAndWhyToReadItWithCare,
	);

	it(
		"feeds each case's cards that case's mode, attempts and A to B attribution",
		feedsEachCaseSCardsThatCaseSModeAttemptsAndAToBAttribution,
	);

	it(
		"keeps each case's arm cards in view in both presentations",
		keepsEachCaseSArmCardsInViewInBothPresentations,
	);

	it(
		"draws each case's arm cards from that case's own records",
		drawsEachCaseSArmCardsFromThatCaseSOwnRecords,
	);

	it(
		"shows what moved by default, with attempt evidence one view away",
		showsWhatMovedByDefaultWithAttemptEvidenceOneViewAway,
	);

	it(
		"draws each case's What moved rows from that case's own served rows",
		drawsEachCaseSWhatMovedRowsFromThatCaseSOwnServedRows,
	);

	it(
		"states only baseline (before) against candidate (after)'s attribution for each case under What moved",
		statesOnlyBaselineBeforeAgainstCandidateAfterSAttributionForEachCaseUnderWhatMoved,
	);

	it(
		"links only comparison reps whose saved provenance is still valid",
		linksOnlyComparisonRepsWhoseSavedProvenanceIsStillValid,
	);
});

async function drawsEachCaseSAttemptsWithWhatThePairingSaysAndWhyToReadItWithCare(): Promise<void> {
	renderPage();

	fireEvent.click(await screen.findByRole("button", { name: "Attempt pairs" }));

	const caseTwo = await screen.findByRole("region", {
		name: "Attempt pairs · case-2",
	});

	expect(
		within(caseTwo).getByRole("table", { name: "Attempt pairs · case-2" }),
	).toBeInTheDocument();
	expect(
		within(caseTwo).getByRole("region", { name: "What the pairing says" }),
	).toBeInTheDocument();
	expect(
		within(caseTwo).getByRole("region", { name: "Read with care" }),
	).toBeInTheDocument();
	expect(
		screen.getByRole("region", { name: "Attempt pairs · case-1" }),
	).toBeInTheDocument();
}

async function feedsEachCaseSCardsThatCaseSModeAttemptsAndAToBAttribution(): Promise<void> {
	renderPage(pipelinePairingComparison());

	fireEvent.click(await screen.findByRole("button", { name: "Attempt pairs" }));

	const caseOne = await screen.findByRole("region", {
		name: "Attempt pairs · case-1",
	});
	const says = within(caseOne).getByRole("region", {
		name: "What the pairing says",
	});
	const care = within(caseOne).getByRole("region", {
		name: "Read with care",
	});

	expect(says).toHaveTextContent(
		"Candidate (after) against baseline (before) on final",
	);
	expect(says).not.toHaveTextContent("on review");
	expect(care).toHaveTextContent(
		"Control 1, baseline (before) 2 and candidate (after) 3 attempts.",
	);
	expect(care).toHaveTextContent(
		"Only output-styles/brief.md differs between the recorded corpora",
	);
	expect(
		within(caseOne).getByText(
			"No attempt history to open: a pipeline comparison's attempts record no session.",
		),
	).toBeInTheDocument();
}

async function keepsEachCaseSArmCardsInViewInBothPresentations(): Promise<void> {
	renderPage();
	await screen.findByRole("region", { name: "Arms · case-1" });

	fireEvent.click(screen.getByRole("button", { name: "Attempt pairs" }));

	expect(
		screen.getByRole("region", { name: "Arms · case-1" }),
	).toBeInTheDocument();
	expect(
		screen.getByRole("region", { name: "Arms · case-2" }),
	).toBeInTheDocument();
}

async function drawsEachCaseSArmCardsFromThatCaseSOwnRecords(): Promise<void> {
	const body = comparisonResponseBody();
	const caseTwo = body.armFigures["case-2"];
	if (caseTwo === undefined) {
		throw new Error("Expected the fixture to hold case-2's figures");
	}
	renderPage({
		...body,
		armFigures: {
			...body.armFigures,
			"case-2": {
				...caseTwo,
				candidate: {
					...PASSED_EVERY_ATTEMPT,
					cost: { perAttemptUsd: 7, state: "available", totalUsd: 7 },
				},
			},
		},
	});

	const caseTwoBand = await screen.findByRole("region", {
		name: "Arms · case-2",
	});
	const caseOneBand = screen.getByRole("region", { name: "Arms · case-1" });

	expect(
		within(caseTwoBand).getByRole("article", { name: "CANDIDATE (AFTER)" }),
	).toHaveTextContent("$7.00");
	expect(
		within(caseOneBand).getByRole("article", { name: "CANDIDATE (AFTER)" }),
	).toHaveTextContent("$2.00");
}

async function showsWhatMovedByDefaultWithAttemptEvidenceOneViewAway(): Promise<void> {
	renderPage();

	await screen.findByRole("region", { name: "What moved · case-1" });
	expect(
		screen.getByRole("button", { name: "Attempt pairs", pressed: false }),
	).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "What moved", pressed: true }),
	).toBeInTheDocument();
}

async function drawsEachCaseSWhatMovedRowsFromThatCaseSOwnServedRows(): Promise<void> {
	renderPage();

	fireEvent.click(await screen.findByRole("button", { name: "What moved" }));

	const caseOne = screen.getByRole("table", { name: "What moved · case-1" });
	const caseTwo = screen.getByRole("table", { name: "What moved · case-2" });
	expect(
		within(caseOne)
			.getAllByRole("rowheader")
			.map((header) => header.textContent),
	).toEqual(["finalRecorded outcome"]);
	expect(within(caseOne).getByText("inside rerun noise")).toBeInTheDocument();
	expect(
		within(caseTwo)
			.getAllByRole("rowheader")
			.map((header) => header.textContent),
	).toEqual(["Reply lengthPer-attempt mean"]);
	expect(within(caseTwo).getByText("unavailable")).toBeInTheDocument();
}

async function statesOnlyBaselineBeforeAgainstCandidateAfterSAttributionForEachCaseUnderWhatMoved(): Promise<void> {
	const expectedMatchingElementsCount = 1;

	renderPage();

	fireEvent.click(await screen.findByRole("button", { name: "What moved" }));

	const caseOne = screen.getByRole("region", {
		name: "Attribution · case-1",
	});
	const caseTwo = screen.getByRole("region", {
		name: "Attribution · case-2",
	});
	expect(caseOne).toHaveTextContent(
		"The only recorded corpus difference between baseline and candidate is output-styles/brief.md.",
	);
	expect(within(caseOne).getAllByText("output-styles/brief.md")).toHaveLength(
		expectedMatchingElementsCount,
	);
	expect(caseTwo).toHaveTextContent(
		"2 files differ between baseline and candidate, so no movement between them is attributed to one file.",
	);
	expect(screen.queryByText(/vs control/u)).not.toBeInTheDocument();
}

async function linksOnlyComparisonRepsWhoseSavedProvenanceIsStillValid(): Promise<void> {
	const body = comparisonResponseBody();
	renderPage({
		...body,
		attemptHistories: {
			"case-1": {
				baseline: [
					{
						groupId: "group-a",
						href: "/groups/group-a/reps/rep-1/attempt",
						ordinal: 1,
						repId: "rep-1",
						status: "available",
					},
				],
				candidate: [],
				control: [{ ordinal: 1, repId: "rep-1", status: "stale" }],
			},
		},
	});

	fireEvent.click(await screen.findByRole("button", { name: "Attempt pairs" }));

	const table = await screen.findByRole("table", {
		name: "Attempt pairs · case-1",
	});
	expect(
		within(table).getByRole("link", {
			name: "Baseline (before) attempt 1 history",
		}),
	).toHaveAttribute(
		"href",
		`/groups/group-a/reps/rep-1/attempt?view=context&comparison=${DIGEST}`,
	);
	expect(
		within(table).getByRole("link", {
			name: "Baseline (before) attempt 1 results",
		}),
	).toHaveAttribute(
		"href",
		`/groups/group-a/reps/rep-1/attempt?view=results&comparison=${DIGEST}`,
	);
	expect(within(table).getByText("history stale")).toBeInTheDocument();
}
