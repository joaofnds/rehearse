import { describe, expect, it } from "bun:test";

import { within } from "@testing-library/react";

import WhatMoved from "./what-moved";
import {
	OVERALL,
	UNRECORDED,
	UNRECORDED_LENGTH,
	cell,
	renderWhatMoved,
} from "./what-moved-test-fixtures";

describe(WhatMoved.name, () => {
	it(
		"labels the aligned grade plot as an observed range with median points and keeps control visible",
		labelsTheAlignedGradePlotAsAnObservedRangeWithMedianPointsAndKeepsControlVisible,
	);

	it(
		"keeps a missing measure unavailable with its reason and draws no range",
		keepsAMissingMeasureUnavailableWithItsReasonAndDrawsNoRange,
	);
});

function labelsTheAlignedGradePlotAsAnObservedRangeWithMedianPointsAndKeepsControlVisible(): void {
	renderWhatMoved([OVERALL]);

	const plot = within(cell("build", "Range and uncertainty")).getByRole(
		"figure",
		{ name: "build · Median and observed grade range" },
	);
	expect(plot).toHaveTextContent("Control");
	expect(plot).toHaveTextContent("C to C · C median");
	expect(plot).toHaveTextContent("C to B · C median");
	expect(plot).toHaveTextContent("B to A · B median");
	expect(plot).not.toHaveTextContent("confidence");
}

function keepsAMissingMeasureUnavailableWithItsReasonAndDrawsNoRange(): void {
	renderWhatMoved([UNRECORDED_LENGTH]);

	expect(cell("Reply length", "Candidate vs baseline")).toHaveTextContent(
		"unavailable",
	);
	expect(cell("Reply length", "Baseline (before)")).toHaveTextContent(
		"Not recorded",
	);
	expect(cell("Reply length", "Range and uncertainty")).toHaveTextContent(
		UNRECORDED,
	);
	expect(
		within(cell("Reply length", "Range and uncertainty")).queryByRole("figure"),
	).not.toBeInTheDocument();
}
