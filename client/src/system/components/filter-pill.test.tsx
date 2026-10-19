import { describe, expect, it } from "bun:test";

import { render, screen } from "@testing-library/react";

import FilterPill from "./filter-pill";

function noop(): void {
	return undefined;
}

describe(FilterPill.name, () => {
	it("renders as a button carrying its label", () => {
		render(
			<FilterPill pressed={false} onPress={noop}>
				All 148
			</FilterPill>,
		);

		expect(screen.getByRole("button", { name: "All 148" })).toBeInTheDocument();
	});

	it("marks aria-pressed true when selected", () => {
		render(
			<FilterPill pressed={true} onPress={noop}>
				Running
			</FilterPill>,
		);

		expect(screen.getByRole("button", { name: "Running" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
	});

	it("marks aria-pressed false when not selected", () => {
		render(
			<FilterPill pressed={false} onPress={noop}>
				Running
			</FilterPill>,
		);

		expect(screen.getByRole("button", { name: "Running" })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
	});
});
