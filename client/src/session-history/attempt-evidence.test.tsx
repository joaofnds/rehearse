import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import type { AttemptEvidenceResponse } from "./attempt-evidence-query";
import { originalFetch, showSession } from "./attempt-evidence-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("saved attempt evidence", () => {
	it(
		"orders failed state checks before the passed disclosure",
		ordersAndDisclosesSavedStateChecks,
	);
	it(
		"shows the recorded reply beside failed and passed checks with their explanations",
		showsTheRecordedReplyBesideFailedAndPassedChecksWithTheirExplanations,
	);

	it(
		"does not call absent checks failures when a session produced no reply",
		doesNotCallAbsentChecksFailuresWhenASessionProducedNoReply,
	);

	it(
		"distinguishes a successful recorded result from failed saved state checks and orders failures first",
		distinguishesASuccessfulRecordedResultFromFailedSavedStateChecksAndOrdersFailuresFirst,
	);

	it(
		"distinguishes a recorded unsuccessful result from fully passing saved state checks",
		distinguishesARecordedUnsuccessfulResultFromFullyPassingSavedStateChecks,
	);

	it.each(["NO_REPLY", "EXECUTION_FAILED"] as const)(
		"keeps %s separate from a check assessment disagreement",
		readsExecutionOutcome,
	);

	it(
		"keeps an incomplete state assessment unavailable rather than claiming an inverse disagreement",
		keepsAnIncompleteStateAssessmentUnavailableRatherThanClaimingAnInverseDisagreement,
	);

	it(
		"keeps a scorer failure separate from state check failures",
		keepsAScorerFailureSeparateFromStateCheckFailures,
	);
});

async function showsTheRecordedReplyBesideFailedAndPassedChecksWithTheirExplanations(): Promise<void> {
	showSession({
		caseId: "case-a",
		checks: [
			{
				detail: "6 words exceeds the ceiling of 3.",
				kind: "word-band",
				status: "FAIL",
			},
			{
				detail: "No forbidden tools were called.",
				kind: "tool-calls",
				status: "PASS",
			},
		],
		outcome: "UNSUCCESSFUL",
		reply: "The saved answer has three words.",
	});
	expect(
		await screen.findByText("The saved answer has three words."),
	).toBeInTheDocument();
	expect(screen.getByText("FAIL · word-band")).toBeInTheDocument();
	expect(
		screen.getByText("6 words exceeds the ceiling of 3."),
	).toBeInTheDocument();
	expect(screen.getByText("PASS · tool-calls")).toBeInTheDocument();
	expect(screen.queryByText("Step Judge assessment")).not.toBeInTheDocument();
}

async function doesNotCallAbsentChecksFailuresWhenASessionProducedNoReply(): Promise<void> {
	showSession({ caseId: "case-a", checks: [], outcome: "NO_REPLY" });
	expect(
		await screen.findByText(/no reply; no reply checks were evaluated/u),
	).toBeInTheDocument();
	expect(
		screen.getByText(/No check outcomes were recorded/u),
	).toBeInTheDocument();
	expect(screen.queryByText(/^FAIL/u)).not.toBeInTheDocument();
}

async function distinguishesASuccessfulRecordedResultFromFailedSavedStateChecksAndOrdersFailuresFirst(): Promise<void> {
	showSession({
		caseId: "case-a",
		checks: [{ detail: "Allowed tool.", kind: "tool-calls", status: "PASS" }],
		outcome: "SUCCESSFUL",
		reply: "done",
		stateResults: [
			{ detail: "Retained state.", name: "retained", status: "PASS" },
			{
				detail: "History was removed.",
				name: "history-preserved",
				status: "FAIL",
			},
		],
	});
	expect(
		await screen.findByText("Recorded outcome: SUCCESSFUL"),
	).toBeInTheDocument();
	expect(
		screen.getByText("1 of 1 reply/transcript checks passed"),
	).toBeInTheDocument();
	expect(
		screen.getByText("1 of 2 saved state checks passed"),
	).toBeInTheDocument();
	expect(
		screen.getByText(/Recorded success and saved state checks disagree/u),
	).toBeInTheDocument();
}

async function ordersAndDisclosesSavedStateChecks(): Promise<void> {
	showSession({
		caseId: "case-a",
		checks: [{ detail: "Allowed tool.", kind: "tool-calls", status: "PASS" }],
		outcome: "SUCCESSFUL",
		reply: "done",
		stateResults: [
			{ detail: "Retained state.", name: "retained", status: "PASS" },
			{
				detail: "History was removed.",
				name: "history-preserved",
				status: "FAIL",
			},
		],
	});
	await screen.findByText("Recorded outcome: SUCCESSFUL");
	const checks = within(
		screen.getByRole("list", { name: "Saved state checks" }),
	).getAllByRole("listitem");
	const [observedFirstCheck] = checks;
	expect(observedFirstCheck).toHaveTextContent("FAIL · history-preserved");
	const passed = screen.getByText("Saved state checks: 1 passed", {
		selector: "summary",
	});
	expect(passed.parentElement).not.toHaveAttribute("open");
	fireEvent.click(passed);
	expect(screen.getByText("Retained state.")).toBeInTheDocument();
	expect(
		screen.getByText("Reply/transcript checks: 1 passed", {
			selector: "summary",
		}).parentElement,
	).not.toHaveAttribute("open");
}

async function distinguishesARecordedUnsuccessfulResultFromFullyPassingSavedStateChecks(): Promise<void> {
	showSession({
		caseId: "case-a",
		checks: [
			{ detail: "Reply was too short.", kind: "word-band", status: "FAIL" },
		],
		outcome: "UNSUCCESSFUL",
		reply: "done",
		stateResults: [
			{ detail: "Saved state retained.", name: "retained", status: "PASS" },
		],
	});

	expect(
		await screen.findByText(
			"Recorded unsuccessful outcome and saved state checks differ: all saved state checks passed.",
		),
	).toBeInTheDocument();
	expect(
		screen.getByText("Recorded outcome: UNSUCCESSFUL"),
	).toBeInTheDocument();
	expect(
		screen.getByText("0 of 1 reply/transcript checks passed"),
	).toBeInTheDocument();
	expect(
		screen.getByText("1 of 1 saved state checks passed"),
	).toBeInTheDocument();
}

async function keepsAnIncompleteStateAssessmentUnavailableRatherThanClaimingAnInverseDisagreement(): Promise<void> {
	showSession({
		caseId: "case-a",
		checks: [],
		outcome: "UNSUCCESSFUL",
		stateGradingError: "Remaining state checks unavailable",
		stateResults: [
			{ detail: "Saved state retained.", name: "retained", status: "PASS" },
		],
	});

	expect(
		await screen.findByText(
			"State checks unavailable: Remaining state checks unavailable",
		),
	).toBeInTheDocument();
	expect(
		screen.queryByText(
			/Recorded unsuccessful outcome and saved state checks differ/u,
		),
	).not.toBeInTheDocument();
}

async function keepsAScorerFailureSeparateFromStateCheckFailures(): Promise<void> {
	showSession({
		caseId: "case-a",
		checks: [{ detail: "One word.", kind: "word-band", status: "PASS" }],
		outcome: "SUCCESSFUL",
		reply: "done",
		stateGradingError: "Scorer did not exit successfully",
	});
	expect(
		await screen.findByText(
			"State checks unavailable: Scorer did not exit successfully",
		),
	).toBeInTheDocument();
	expect(screen.queryByText(/^FAIL/u)).not.toBeInTheDocument();
}

async function readsExecutionOutcome(
	outcome: Extract<
		AttemptEvidenceResponse,
		{ readonly kind: "session" }
	>["record"]["outcome"],
): Promise<void> {
	showSession({
		caseId: "case-a",
		checks: [],
		outcome,
		stateResults: [
			{ detail: "Saved state retained.", name: "retained", status: "PASS" },
		],
	});

	expect(
		await screen.findByText(`Recorded outcome: ${outcome}`),
	).toBeInTheDocument();
	expect(
		screen.queryByText(
			/Recorded unsuccessful outcome and saved state checks differ/u,
		),
	).not.toBeInTheDocument();
}
