import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { ScreenHeader } from "./screen-header";

describe(ScreenHeader.name, () => {
	it("renders the title as the screen's level-one heading", () => {
		render(<ScreenHeader title="Run history" />);

		expect(
			screen.getByRole("heading", { level: 1, name: "Run history" }),
		).toBeInTheDocument();
	});

	it("renders the subline beneath the title", () => {
		render(<ScreenHeader title="Run history" subline="4 records on disk" />);

		expect(screen.getByText("4 records on disk")).toBeInTheDocument();
	});

	it("renders the aside beside the title", () => {
		render(
			<ScreenHeader
				title="Comparison"
				aside={<button type="button">Switch</button>}
			/>,
		);

		expect(screen.getByRole("button", { name: "Switch" })).toBeInTheDocument();
	});
});
