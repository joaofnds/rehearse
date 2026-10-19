import { describe, expect, it } from "bun:test";

import { within } from "@testing-library/react";

import { band, card, renderBand } from "./arm-card-test-fixtures";
import ArmCardsBand from "./arm-cards-band";

describe(ArmCardsBand.name, () => {
	it(
		"links each distinct validated source group and keeps the comparison return path",
		linksEachDistinctValidatedSourceGroupAndKeepsTheComparisonReturnPath,
	);

	it(
		"opens a single validated group without an ordinal suffix",
		opensASingleValidatedGroupWithoutAnOrdinalSuffix,
	);

	it(
		"offers no group destination without a validated available attempt history",
		offersNoGroupDestinationWithoutAValidatedAvailableAttemptHistory,
	);
});

function linksEachDistinctValidatedSourceGroupAndKeepsTheComparisonReturnPath(): void {
	renderBand({
		histories: {
			baseline: [
				{
					groupId: "source-a",
					href: "/groups/source-a/reps/rep-1/attempt",
					ordinal: 1,
					repId: "rep-1",
					status: "available",
				},
				{
					groupId: "source-a",
					href: "/groups/source-a/reps/rep-2/attempt",
					ordinal: 2,
					repId: "rep-2",
					status: "available",
				},
				{
					groupId: "source-b",
					href: "/groups/source-b/reps/rep-3/attempt",
					ordinal: 3,
					repId: "rep-3",
					status: "available",
				},
			],
			candidate: [],
			control: [],
		},
	});

	const links = within(card("BASELINE (BEFORE)")).getAllByRole("link");
	expect(
		links.map((link) => [link.textContent, link.getAttribute("href")]),
	).toEqual([
		["Open group 1", "/groups/source-a?view=attempts&comparison=comparison-a"],
		["Open group 2", "/groups/source-b?view=attempts&comparison=comparison-a"],
	]);
}

function opensASingleValidatedGroupWithoutAnOrdinalSuffix(): void {
	renderBand({
		histories: {
			baseline: [],
			candidate: [
				{
					groupId: "candidate-a",
					href: "/groups/candidate-a/reps/rep-1/attempt",
					ordinal: 1,
					repId: "rep-1",
					status: "available",
				},
			],
			control: [],
		},
	});

	expect(
		within(card("CANDIDATE (AFTER)")).getByRole("link", {
			name: "Open group",
		}),
	).toHaveAttribute(
		"href",
		"/groups/candidate-a?view=attempts&comparison=comparison-a",
	);
}

function offersNoGroupDestinationWithoutAValidatedAvailableAttemptHistory(): void {
	renderBand({
		histories: {
			baseline: [{ ordinal: 1, repId: "rep-1", status: "stale" }],
			candidate: [],
			control: [],
		},
	});

	expect(within(band()).queryByRole("link")).not.toBeInTheDocument();
}
