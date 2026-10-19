import { describe, expect, it } from "bun:test";

import { fireEvent, render, screen, within } from "@testing-library/react";

import type { SessionHistoryRequestSeries } from "#benchmark/session-history";
import { sessionHistoryRequestSeries } from "#benchmark/session-history";

import {
	RequestCostReadings,
	RequestTimeline,
	costLabel,
} from "./request-timeline";

describe(RequestTimeline.name, () => {
	it(
		"keeps peak request input separate from attempt totals",
		keepsPeakRequestInputSeparateFromAttemptTotals,
	);

	it(
		"reads a request whose rows never settled as incomplete with its lower bound",
		readsARequestWhoseRowsNeverSettledAsIncompleteWithItsLowerBound,
	);
});

describe(costLabel.name, () => {
	it(
		"leads with unpriced when no request contributes a known subtotal",
		leadsWithUnpricedWhenNoRequestContributesAKnownSubtotal,
	);

	it(
		"keeps a known subtotal and its coverage when some requests are unpriced",
		keepsAKnownSubtotalAndItsCoverageWhenSomeRequestsAreUnpriced,
	);
});

describe(RequestCostReadings.name, () => {
	it(
		"rounds a headline while retaining the exact saved amount in detail",
		roundsAHeadlineWhileRetainingTheExactSavedAmountInDetail,
	);

	it(
		"keeps a partial subtotal separate from complete pricing reasons containing separators",
		keepsAPartialSubtotalSeparateFromCompletePricingReasonsContainingSeparators,
	);
});

function keepsPeakRequestInputSeparateFromAttemptTotals(): void {
	const series = peakRequestSeries();
	const selectedRequests: number[] = [];
	render(
		<RequestTimeline
			series={series}
			entries={series.entries}
			requestCosts={[]}
			instructionLoads={{ state: "unavailable" }}
			selected={undefined}
			onSelect={(entry) => {
				selectedRequests.push(entry.line);
			}}
		/>,
	);
	expect(selectedRequests).toEqual([]);

	const peak = screen.getByText("Peak measured input").closest("div");
	if (peak === null) {
		throw new Error("Peak reading is missing");
	}
	expect(within(peak).getByText("70 tokens")).toBeVisible();
	expect(
		screen.getByText(
			"✓ Complete · 90 total input tokens over 2 attempt requests",
		),
	).toBeVisible();
}

function readsARequestWhoseRowsNeverSettledAsIncompleteWithItsLowerBound(): void {
	const series = sessionHistoryRequestSeries({
		prefixLinesExcluded: 0,
		transcript: JSON.stringify({
			message: {
				model: "claude-opus-5",
				stop_reason: null,
				usage: {
					cache_creation_input_tokens: 0,
					cache_read_input_tokens: 100,
					input_tokens: 2,
					output_tokens: 40,
				},
			},
			requestId: "req-streaming",
			type: "assistant",
		}),
	});

	const selectedRequests: number[] = [];
	render(
		<RequestTimeline
			series={series}
			entries={series.entries}
			requestCosts={[]}
			instructionLoads={{ state: "unavailable" }}
			selected={undefined}
			onSelect={(entry) => {
				selectedRequests.push(entry.line);
			}}
		/>,
	);
	expect(selectedRequests).toEqual([]);

	const [request] = within(
		screen.getByRole("listbox", { name: "Request timeline" }),
	).getAllByRole("option");
	expect(request).toHaveTextContent("incomplete");
	expect(request).toHaveTextContent(
		"at least in 2 · out 40 · read 100 · write 0",
	);
	expect(request).not.toHaveTextContent("conflict");
}

function leadsWithUnpricedWhenNoRequestContributesAKnownSubtotal(): void {
	const label = costLabel({
		costUsd: 0,
		pricedRequestCount: 0,
		reasons: ["missing rates"],
		requestCount: 3,
		state: "incomplete",
	});

	expect(label).toBe("? Unpriced · 0 of 3 requests priced · missing rates");
	expect(label).not.toContain("$0.00");
}

function keepsAKnownSubtotalAndItsCoverageWhenSomeRequestsAreUnpriced(): void {
	const label = costLabel({
		costUsd: 1.25,
		pricedRequestCount: 2,
		reasons: ["missing rates"],
		requestCount: 3,
		state: "incomplete",
	});

	expect(label).toContain("$1.25 known subtotal over 2 of 3 requests");
}

function roundsAHeadlineWhileRetainingTheExactSavedAmountInDetail(): void {
	render(
		<RequestCostReadings
			cost={{
				calculated: { costUsd: 0, state: "complete" },
				difference: { costUsd: 0, state: "complete" },
				reported: { costUsd: 0.0123456, state: "complete" },
			}}
		/>,
	);
	const reading = screen
		.getByText("Provider reported · attempt")
		.closest("div");
	if (reading === null) {
		throw new Error("Reported reading is missing");
	}
	expect(within(reading).getByText("✓ Complete · $0.01")).toBeVisible();

	fireEvent.click(within(reading).getByText("Exact measurement"));

	expect(within(reading).getByText("Exact amount: $0.0123456")).toBeVisible();
}

function keepsAPartialSubtotalSeparateFromCompletePricingReasonsContainingSeparators(): void {
	const reason = "missing rates · catalog unavailable";
	render(
		<RequestCostReadings
			cost={{
				calculated: {
					costUsd: 1.25,
					pricedRequestCount: 2,
					reasons: [reason, "conflicting usage"],
					requestCount: 3,
					state: "incomplete",
				},
				difference: { costUsd: 0.75, state: "complete" },
				reported: { costUsd: 2, state: "complete" },
			}}
		/>,
	);
	const label = screen.getByText("Calculated · root requests");
	const reading = label.closest("div");
	if (reading === null) {
		throw new Error("Missing calculated reading");
	}
	expect(
		within(reading).getByText(
			"◐ Incomplete · $1.25 known subtotal over 2 of 3 requests",
		),
	).toBeVisible();

	fireEvent.click(
		within(reading).getByText("2 pricing gaps · 2/3 requests priced"),
	);

	expect(within(reading).getByText(reason, { exact: true })).toBeVisible();
	expect(
		within(reading).getByText("conflicting usage", { exact: true }),
	).toBeVisible();
}

function peakRequestSeries(): SessionHistoryRequestSeries {
	return sessionHistoryRequestSeries({
		prefixLinesExcluded: 0,
		transcript: [
			JSON.stringify({
				message: {
					model: "claude-opus-5",
					stop_reason: "end_turn",
					usage: {
						cache_creation_input_tokens: 0,
						cache_read_input_tokens: 0,
						input_tokens: 20,
						output_tokens: 2,
					},
				},
				requestId: "small",
				type: "assistant",
			}),
			JSON.stringify({
				message: {
					model: "claude-opus-5",
					stop_reason: "end_turn",
					usage: {
						cache_creation_input_tokens: 0,
						cache_read_input_tokens: 0,
						input_tokens: 70,
						output_tokens: 4,
					},
				},
				requestId: "large",
				type: "assistant",
			}),
		].join("\n"),
	});
}
