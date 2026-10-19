import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen } from "@testing-library/react";

import type { MoreAttemptsCost } from "#benchmark/more-attempts-cost";

import { ComparisonPage } from "./comparison-page";
import type { ComparisonResponseFixture } from "./comparison-page-test-fixtures";
import {
	PREFIX_START_INDEX,
	RETAINED_REPORT_CASE_COUNT,
	comparisonResponseBody,
	originalFetch,
	renderPage,
} from "./comparison-page-test-fixtures";
import { caseSummary } from "./comparison-report-test-fixtures";

function comparedAttempts(
	moreAttempts: MoreAttemptsCost,
): ComparisonResponseFixture {
	const body = comparisonResponseBody();

	return {
		...body,
		baselineArm: {
			kind: "derived",
			skillUnderTest: "skills/discuss/SKILL.md",
		},
		report: {
			...body.report,
			cases: body.report.cases.slice(
				PREFIX_START_INDEX,
				RETAINED_REPORT_CASE_COUNT,
			),
		},
		summary: { "case-1": caseSummary(moreAttempts) },
	};
}

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(ComparisonPage.name, () => {
	describe("when compare attempts made the comparison", () => {
		it(
			"offers baseline (before)'s attempt count again in every arm, at its stated cost",
			offersBaselineBeforeSAttemptCountAgainInEveryArmAtItsStatedCost,
		);

		it(
			"says why more attempts cannot be offered when their cost cannot be stated",
			saysWhyMoreAttemptsCannotBeOfferedWhenTheirCostCannotBeStated,
		);
	});
});

async function offersBaselineBeforeSAttemptCountAgainInEveryArmAtItsStatedCost(): Promise<void> {
	renderPage(
		comparedAttempts({ attemptsPerArm: 4, state: "available", usd: 18 }),
	);

	fireEvent.click(
		await screen.findByRole("button", {
			name: "Add 4 attempts to each arm · ≈ $18.00",
		}),
	);

	expect(
		await screen.findByText(
			"about $18.00, at each arm's mean recorded cost per attempt",
		),
	).toBeInTheDocument();
}

async function saysWhyMoreAttemptsCannotBeOfferedWhenTheirCostCannotBeStated(): Promise<void> {
	renderPage(
		comparedAttempts({
			reasons: ["rep-1 lacks worker.costUsd"],
			state: "unavailable",
		}),
	);

	expect(
		await screen.findByText(
			"What more attempts would cost cannot be stated: rep-1 lacks worker.costUsd.",
		),
	).toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: /attempts? to each arm/u }),
	).not.toBeInTheDocument();
}
