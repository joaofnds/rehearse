import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { GRADE_SIZES } from "./components/grade";
import { STATUS_STATES } from "./components/status";
import { SystemPage } from "./system-page";

describe(SystemPage.name, () => {
	it("renders a swatch for every color token", () => {
		render(<SystemPage />);

		expect(screen.getByText("--color-canvas")).toBeInTheDocument();
		expect(screen.getByText("--color-accent")).toBeInTheDocument();
		expect(screen.getByText("--color-diff-remove")).toBeInTheDocument();
	});

	it.each([...STATUS_STATES])("renders the %s status state", (state) => {
		render(<SystemPage />);

		expect(
			screen.getAllByText(state.replaceAll("-", " ")).length,
		).toBeGreaterThan(0);
	});

	it.each([...GRADE_SIZES])("renders the %s grade size", (size) => {
		render(<SystemPage />);

		expect(screen.getByText(size)).toBeInTheDocument();
	});

	it("renders the corpus pill", () => {
		render(<SystemPage />);

		expect(screen.getByText("corpus@a41c7e")).toBeInTheDocument();
	});

	it("renders the table shell's caption as a section label", () => {
		render(<SystemPage />);

		expect(screen.getByText("DURABLE RECORDS")).toBeInTheDocument();
	});

	it("renders the filter pill", () => {
		render(<SystemPage />);

		expect(screen.getByRole("button", { name: "All 148" })).toBeInTheDocument();
	});

	it("renders the table shell", () => {
		render(<SystemPage />);

		expect(screen.getByRole("table")).toBeInTheDocument();
	});

	it.each(["Step node card", "Stat card", "Dialog shell"])(
		"names %s as not yet built",
		(name) => {
			render(<SystemPage />);

			expect(screen.getByText(name, { exact: false })).toBeInTheDocument();
		},
	);

	it("names ACT-51 as needing the step node card and the dialog shell", () => {
		render(<SystemPage />);

		expect(screen.getAllByText(/ACT-51/u).length).toBe(2);
	});

	it("demonstrates the disclosure, collapsed until its control is pressed", () => {
		render(<SystemPage />);

		expect(screen.getByRole("button", { name: "2 cited" })).toHaveAttribute(
			"aria-expanded",
			"false",
		);
	});

	it("renders the planned-feature block", () => {
		render(<SystemPage />);

		expect(
			screen.getByRole("heading", {
				name: "Edit an instruction, review, then apply",
			}),
		).toBeInTheDocument();
		expect(screen.getByText("PLANNED")).toBeInTheDocument();
	});
});
