import { describe, expect, it } from "bun:test";

import { render, screen } from "@testing-library/react";

import RangePlot from "./range-plot";

const LABEL_DECIMAL_PLACES = 2;

describe("range plot", () => {
	it("keeps the unit and each arm's exact range available alongside the drawing", () => {
		render(
			<RangePlot
				label="Cost per attempt · observed range"
				minimum={0}
				maximum={2}
				formatValue={(value) => `$${value.toFixed(LABEL_DECIMAL_PLACES)}`}
				rows={[
					{
						high: 1.74,
						id: "baseline",
						label: "Baseline",
						low: 0.31,
						value: 1.1,
					},
					{
						high: 1.59,
						id: "candidate",
						label: "Candidate",
						low: 0.42,
						value: 1.16,
					},
				]}
			/>,
		);

		expect(
			screen.getByRole("figure", { name: "Cost per attempt · observed range" }),
		).toBeInTheDocument();
		expect(screen.getByText("$0.31 to $1.74 · $1.10 mean")).toBeInTheDocument();
		expect(screen.getByText("$0.42 to $1.59 · $1.16 mean")).toBeInTheDocument();
	});

	it("retains measured zero when the range collapses", () => {
		render(
			<RangePlot
				label="Failed checks"
				minimum={0}
				maximum={0}
				formatValue={String}
				rows={[{ high: 0, id: "control", label: "Control", low: 0, value: 0 }]}
			/>,
		);

		expect(screen.getByText("0 to 0 · 0 mean")).toBeInTheDocument();
	});
});
