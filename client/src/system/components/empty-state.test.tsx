import { describe, expect, it } from "bun:test";

import { render, screen } from "@testing-library/react";

import EmptyState from "./empty-state";

describe(EmptyState.name, () => {
	it("renders its heading and its children as the body", () => {
		render(
			<EmptyState heading="No runs recorded">
				<p>Declare a case, then run it.</p>
			</EmptyState>,
		);

		expect(
			screen.getByRole("heading", { name: "No runs recorded" }),
		).toBeInTheDocument();
		expect(
			screen.getByText("Declare a case, then run it."),
		).toBeInTheDocument();
	});
});
