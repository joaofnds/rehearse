import { afterEach, describe, expect, it } from "bun:test";

import { within } from "@testing-library/react";

import {
	ENDED,
	ledgerCard,
	originalFetch,
	renderAwaitingFirstStep,
} from "#client/test-support/run-detail/ledger-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("Record ledger", () => {
	describe("a stage awaiting judgment", () => {
		it.each([
			[
				"once the run ended",
				"INTERRUPTED",
				ENDED,
				"This step's judge never returned: the run ended while this stage awaited judgment.",
				"no evidence",
			],
			[
				"while the run is in flight",
				"RUNNING",
				{ stage: "shape", status: "PENDING" },
				"This step's judge has not returned its blockers and dimensions yet.",
				"evidence pending",
			],
		] as const)(
			"says %s whether its judge can still return",
			async (...[_when, status, finalOutcome, body, toggle]) => {
				renderAwaitingFirstStep(status, finalOutcome);

				const firstStep = await ledgerCard("Step 1 · shape");
				const card = firstStep;

				expect(await within(card).findByText(body)).toBeInTheDocument();
				expect(
					within(card).getByRole("button", { name: toggle }),
				).toBeInTheDocument();
			},
		);

		it(
			"heads the stage of an ended run as its judge never returning",
			headsTheStageOfAnEndedRunAsItsJudgeNeverReturning,
		);
	});
});

async function headsTheStageOfAnEndedRunAsItsJudgeNeverReturning(): Promise<void> {
	renderAwaitingFirstStep("INTERRUPTED", ENDED);

	const firstStep = await ledgerCard("Step 1 · shape");

	expect(
		within(firstStep).getByRole("heading", { level: 2 }).parentElement,
	).toHaveTextContent("⊘judge never returned");
}
