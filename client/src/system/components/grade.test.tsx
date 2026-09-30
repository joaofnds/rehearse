import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Grade } from "./grade";

describe(Grade.name, () => {
	it("renders the letter grade", () => {
		render(<Grade value={{ letter: "A−" }} size="inline" />);

		expect(screen.getByText("A−")).toBeInTheDocument();
	});

	it("renders a pending grade as an em dash", () => {
		render(<Grade value={{ pending: true }} size="inline" />);

		expect(screen.getByText("—")).toBeInTheDocument();
	});

	it.each([
		["A−", "text-pale"],
		["B+", "text-foreground"],
		["C", "text-secondary-foreground"],
		["D", "text-bright"],
		["F", "text-bright"],
	])("colours a %s as the design colours its letter", (letter, colour) => {
		render(<Grade value={{ letter }} size="node" />);

		expect(screen.getByText(letter)).toHaveClass(colour);
	});

	it("colours a pending grade as the design colours a missing one", () => {
		render(<Grade value={{ pending: true }} size="node" />);

		expect(screen.getByText("—")).toHaveClass("text-subdued");
	});
});
