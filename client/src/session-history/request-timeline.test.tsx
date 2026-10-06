import { describe, expect, it } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import { sessionHistoryRequestSeries } from "#benchmark/session-history";
import { RequestTimeline } from "./request-timeline";

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
				cost={{
					reported: { state: "unavailable", reasons: ["none"] },
					calculated: { state: "unavailable", reasons: ["none"] },
					difference: { state: "unavailable", reasons: ["none"] },
				}}
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
