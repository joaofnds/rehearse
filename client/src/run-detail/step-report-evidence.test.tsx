import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import { RUN } from "#client/test-support/run-detail";

import {
	NO_CITED_REPORT_BUTTONS,
	originalFetch,
	renderBuildReport,
	stepReport,
} from "./step-report-test-fixtures";

const expectedOpenCount = 2;

const BLOCKER_CITATION_REPLIES = new Map<string, unknown>([
	[
		`/api/runs/${RUN}/stages/build/evidence/hardBlockers/scope-declared-before-edit/0`,
		{
			claim: "The agent chose a scope without asking",
			path: "transcript",
			record: `${RUN}.build.json`,
			source: "transcript",
			view: { kind: "absent" },
		},
	],
]);

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("the selected step in Results", () => {
	describe("step report", () => {
		it(
			"reads each opened citation source, locator and quote",
			readsMultipleCitationSources,
		);
		it(
			"opens several rows' evidence at once, each item with its source, place or path, and quote",
			opensSeveralRowsEvidenceAtOnceEachItemWithItsSourcePlaceOrPathAndQuote,
		);

		describe("with a blocker citation open", () => {
			it(
				"opens a citation beside Results without losing the selected step",
				opensACitationBesideResultsWithoutLosingTheSelectedStep,
			);
		});

		it("opens every row's cited evidence on e", opensEveryRowSCitedEvidenceOnE);
	});
});

async function opensSeveralRowsEvidenceAtOnceEachItemWithItsSourcePlaceOrPathAndQuote(): Promise<void> {
	renderBuildReport();

	const report = await stepReport();
	for (const toggle of within(report).getAllByRole("button", {
		name: "1 cited",
	})) {
		fireEvent.click(toggle);
	}
	const open = within(report).getAllByRole("button", {
		name: "hide evidence",
	});
	const [observedFirstOpen] = open;
	const [observedFirstButton] = within(report).getAllByRole("button", {
		name: "no evidence",
	});

	expect(open).toHaveLength(expectedOpenCount);
	expect(observedFirstOpen).toHaveAttribute("aria-expanded", "true");
	expect(observedFirstButton).toHaveAttribute("aria-disabled", "true");
}

async function readsMultipleCitationSources(): Promise<void> {
	renderBuildReport();

	const report = await stepReport();
	for (const toggle of within(report).getAllByRole("button", {
		name: "1 cited",
	})) {
		fireEvent.click(toggle);
	}

	expect(report).toHaveTextContent(
		"transcriptexchange 3 message, characters 0-25I'll take the small scope",
	);
	expect(report).toHaveTextContent("diffsrc/auth/tokens.ts");
}

async function opensACitationBesideResultsWithoutLosingTheSelectedStep(): Promise<void> {
	const citationRouter = renderBuildReport({ extra: BLOCKER_CITATION_REPLIES });

	const report = await stepReport();
	fireEvent.click(
		within(
			within(report).getByText(
				(_content, element) =>
					element?.tagName === "LI" &&
					element.textContent.includes("scope-declared-before-edit"),
			),
		).getByRole("button", { name: "1 cited" }),
	);
	const citationHref = citationRouter.state.location.href;
	fireEvent.click(
		within(report).getByRole("link", {
			name: "exchange 3 message, characters 0-25",
		}),
	);

	expect(
		within(
			await screen.findByRole("dialog", { name: "Cited source" }),
		).getByText("The agent chose a scope without asking"),
	).toBeInTheDocument();
	expect(citationRouter.state.location.href).toBe(citationHref);

	fireEvent.click(
		within(screen.getByRole("dialog", { name: "Cited source" })).getByRole(
			"button",
			{ name: "Close" },
		),
	);

	expect(
		screen.getByRole("region", { name: "Step report" }),
	).toBeInTheDocument();
	expect(
		within(await screen.findByRole("region", { name: "Task graph" })).getByRole(
			"button",
			{ name: /build/u },
		),
	).toHaveAttribute("aria-current", "step");
}

async function opensEveryRowSCitedEvidenceOnE(): Promise<void> {
	const expectedButtonCount = 3;

	renderBuildReport();

	const report = await stepReport();
	fireEvent.keyDown(document.body, { key: "e" });

	expect(
		within(report).getAllByRole("button", { name: "hide evidence" }),
	).toHaveLength(expectedButtonCount);
	expect(
		within(report).queryAllByRole("button", { name: /cited$/u }),
	).toHaveLength(NO_CITED_REPORT_BUTTONS);
}
