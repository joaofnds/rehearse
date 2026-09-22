import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Grade } from "./grade";

describe(Grade.name, () => {
	it("renders the letter grade", () => {
		render(<Grade value={{ letter: "A−" }} size="13" />);

		expect(screen.getByText("A−")).toBeInTheDocument();
	});

	it("renders a pending grade as an em dash", () => {
		render(<Grade value={{ pending: true }} size="13" />);

		expect(screen.getByText("—")).toBeInTheDocument();
	});
});
