import { afterEach, describe, expect, it } from "bun:test";

import { within } from "@testing-library/react";

import { stoppedAtBuild } from "#client/test-support/run-detail";
import {
	STOPPED_STEP_JUDGE,
	judged,
	ledgerCard,
	ledgerFooter,
	originalFetch,
	renderLedger,
} from "#client/test-support/run-detail/ledger-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("Record ledger", () => {
	it("offers a replay from each stage", offersAReplayFromEachStage);

	it(
		"disables the replay with its reason when the checkpoint the stage started from is missing",
		disablesTheReplayWithItsReasonWhenTheCheckpointTheStageStartedFromIsMissing,
	);

	it(
		"counts the stage's cited evidence on its toggle",
		countsTheStageSCitedEvidenceOnItsToggle,
	);

	it(
		"offers no evidence toggle for a judge it could not read",
		offersNoEvidenceToggleForAJudgeItCouldNotRead,
	);
});

async function offersAReplayFromEachStage(): Promise<void> {
	renderLedger();

	const footers = [
		await ledgerFooter("Step 1 · shape"),
		await ledgerFooter("Step 2 · build"),
	];

	expect(
		footers.map((footer) =>
			within(footer)
				.getByRole("button", { name: /^Replay from here/u })
				.getAttribute("aria-disabled"),
		),
	).toEqual([null, null]);
}

async function disablesTheReplayWithItsReasonWhenTheCheckpointTheStageStartedFromIsMissing(): Promise<void> {
	renderLedger(new Map(), stoppedAtBuild("missing"));

	const stoppedStep = await ledgerFooter("Step 2 · build");

	expect(
		within(stoppedStep).getByRole("button", {
			name: "Replay from here: build has no checkpoint to replay from",
		}),
	).toHaveAttribute("aria-disabled", "true");
}

async function countsTheStageSCitedEvidenceOnItsToggle(): Promise<void> {
	renderLedger(new Map([[STOPPED_STEP_JUDGE, judged()]]));

	const stoppedStep = await ledgerFooter("Step 2 · build");

	expect(
		await within(stoppedStep).findByRole("button", {
			name: "2 cited",
		}),
	).toHaveAttribute("aria-expanded", "false");
}

async function offersNoEvidenceToggleForAJudgeItCouldNotRead(): Promise<void> {
	renderLedger();

	const stoppedStep = await ledgerCard("Step 2 · build");
	const card = stoppedStep;

	expect(
		await within(card).findByText("Could not read this step's judge."),
	).toBeInTheDocument();
	expect(
		within(card).queryByRole("button", { name: /evidence|cited/u }),
	).not.toBeInTheDocument();
}
