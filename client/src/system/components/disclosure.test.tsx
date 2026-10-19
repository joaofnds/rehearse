import { describe, expect, it } from "bun:test";

import { fireEvent, render, screen } from "@testing-library/react";

import Disclosure from "./disclosure";

function renderDisclosure(): void {
	render(
		<Disclosure collapsedLabel="2 causes" expandedLabel="hide causes">
			<p>CLAUDE.md changed</p>
		</Disclosure>,
	);
}

describe(Disclosure.name, () => {
	it("renders the collapsed label as a button, hiding its content, with aria-expanded false", () => {
		renderDisclosure();

		const toggle = screen.getByRole("button", { name: "2 causes" });

		expect(toggle).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByText("CLAUDE.md changed")).not.toBeInTheDocument();
	});

	describe("when the button is pressed", () => {
		it("reveals the content and takes the expanded label", () => {
			renderDisclosure();

			fireEvent.click(screen.getByRole("button", { name: "2 causes" }));

			expect(screen.getByText("CLAUDE.md changed")).toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: "hide causes" }),
			).toHaveAttribute("aria-expanded", "true");
		});

		it("collapses again when pressed a second time", () => {
			renderDisclosure();

			fireEvent.click(screen.getByRole("button", { name: "2 causes" }));
			fireEvent.click(screen.getByRole("button", { name: "hide causes" }));

			expect(screen.queryByText("CLAUDE.md changed")).not.toBeInTheDocument();
		});
	});
});
