import { afterEach, describe, expect, it } from "bun:test";

import { within } from "@testing-library/react";

import ClosedStageSessionBuilder from "#client/test-support/closed-stage-session-test-builder";
import { RUN } from "#client/test-support/run-detail";
import {
	openEvidence,
	originalFetch,
} from "#client/test-support/run-detail/ledger-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("Record ledger", () => {
	describe("expanded evidence", () => {
		it(
			"preserves each item's source, locator, supported criterion and quote",
			preservesEachItemSSourceLocatorSupportedCriterionAndQuote,
		);

		it(
			"closes with a link to the session on disk",
			closesWithALinkToTheSessionOnDisk,
		);

		it(
			"says why there is no session to open when no transcript was kept",
			saysWhyThereIsNoSessionToOpenWhenNoTranscriptWasKept,
		);
	});
});

async function preservesEachItemSSourceLocatorSupportedCriterionAndQuote(): Promise<void> {
	const evidence = await openEvidence(
		new ClosedStageSessionBuilder({ lineCount: 1284 }).build(),
	);

	const items = within(evidence).getAllByRole("listitem");

	expect(items.map((item) => item.textContent)).toEqual([
		"transcriptexchange 3 message, characters 0-25supports scope-declared-before-editI'll take the small scope",
		"diffsrc/a.tssupports scope-discipline",
	]);
	expect(
		within(evidence).getByRole("link", {
			name: "exchange 3 message, characters 0-25",
		}),
	).toHaveAttribute(
		"href",
		`/runs/${RUN}/stages/build/evidence/hardBlockers/scope-declared-before-edit/0`,
	);
	expect(
		within(evidence).getByRole("link", { name: "src/a.ts" }),
	).toHaveAttribute(
		"href",
		`/runs/${RUN}/stages/build/evidence/dimensions/scope-discipline/0`,
	);
}

async function closesWithALinkToTheSessionOnDisk(): Promise<void> {
	const evidence = await openEvidence(
		new ClosedStageSessionBuilder({ lineCount: 1284 }).build(),
	);

	expect(evidence).toHaveTextContent(
		/Uncited spans are not stored here\. Open the full session on disk$/u,
	);
	expect(
		within(evidence).getByRole("link", {
			name: "Open the full session on disk",
		}),
	).toHaveAttribute("href", `/runs/${RUN}/stages/build`);
}

async function saysWhyThereIsNoSessionToOpenWhenNoTranscriptWasKept(): Promise<void> {
	const evidence = await openEvidence({
		spans: [],
		state: "closed",
	});

	expect(evidence).toHaveTextContent(
		"Uncited spans are not stored here. The full session is not recorded: Rehearse kept no copy of this step's session",
	);
}
