import { describe, expect, it } from "bun:test";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { sessionHistoryRequestSeries } from "#benchmark/session-history";
import {
	costLabel,
	RequestTimeline,
	RequestCostReadings,
} from "./request-timeline";

describe(RequestTimeline.name, () => {
	it("reads a request whose rows never settled as incomplete with its lower bound", () => {
		const series = sessionHistoryRequestSeries({
			transcript: JSON.stringify({
				type: "assistant",
				requestId: "req-streaming",
				message: {
					model: "claude-opus-5",
					stop_reason: null,
					usage: {
						input_tokens: 2,
						output_tokens: 40,
						cache_read_input_tokens: 100,
						cache_creation_input_tokens: 0,
					},
				},
			}),
			prefixLinesExcluded: 0,
		});

		render(
			<RequestTimeline
				series={series}
				entries={series.entries}
				requestCosts={[]}
				instructionLoads={{ state: "unavailable" }}
				selected={undefined}
				onSelect={() => undefined}
			/>,
		);

		const [request] = within(
			screen.getByRole("listbox", { name: "Request timeline" }),
		).getAllByRole("option");
		expect(request).toHaveTextContent("incomplete");
		expect(request).toHaveTextContent(
			"at least in 2 · out 40 · read 100 · write 0",
		);
		expect(request).not.toHaveTextContent("conflict");
	});
});

describe(costLabel.name, () => {
	it("leads with unpriced when no request contributes a known subtotal", () => {
		const label = costLabel({
			state: "incomplete",
			costUsd: 0,
			pricedRequestCount: 0,
			requestCount: 3,
			reasons: ["missing rates"],
		});

		expect(label).toBe("? Unpriced · 0 of 3 requests priced · missing rates");
		expect(label).not.toContain("$0.00");
	});

	it("keeps a known subtotal and its coverage when some requests are unpriced", () => {
		const label = costLabel({
			state: "incomplete",
			costUsd: 1.25,
			pricedRequestCount: 2,
			requestCount: 3,
			reasons: ["missing rates"],
		});

		expect(label).toContain("$1.25 known subtotal over 2 of 3 requests");
	});
});

describe(RequestCostReadings.name, () => {
	it("keeps a partial subtotal separate from complete pricing reasons containing separators", () => {
		const reason = "missing rates · catalog unavailable";
		render(
			<RequestCostReadings
				cost={{
					reported: { state: "complete", costUsd: 2 },
					calculated: {
						state: "incomplete",
						costUsd: 1.25,
						pricedRequestCount: 2,
						requestCount: 3,
						reasons: [reason, "conflicting usage"],
					},
					difference: { state: "complete", costUsd: 0.75 },
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
	});
});
