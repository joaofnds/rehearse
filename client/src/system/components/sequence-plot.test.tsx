import { describe, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { SequencePlot } from "./sequence-plot";

describe("sequence plot", () => {
	it("selects the next request from the keyboard, including one with missing usage", () => {
		const selected: string[] = [];
		render(
			<SequencePlot
				label="Request input growth"
				unit="input tokens"
				points={[
					{ id: "one", label: "Request 1", value: 20 },
					{ id: "two", label: "Request 2", value: undefined },
					{ id: "three", label: "Request 3", value: 40 },
				]}
				selected="one"
				formatValue={String}
				onSelect={(id) => {
					selected.push(id);
				}}
			/>,
		);

		fireEvent.keyDown(
			screen.getByRole("button", { name: /Request input growth/u }),
			{ key: "ArrowRight" },
		);

		expect(selected).toEqual(["two"]);
		expect(
			screen.getByText("1 request without settled usage; gaps are not zero."),
		).toBeInTheDocument();
	});
});
