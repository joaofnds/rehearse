import { describe, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { Button } from "./button";

describe(Button.name, () => {
	it("renders a button carrying its accessible name", () => {
		render(<Button>Replay case</Button>);

		expect(
			screen.getByRole("button", { name: "Replay case" }),
		).toBeInTheDocument();
	});

	it("calls onClick when pressed", () => {
		let presses = 0;
		render(
			<Button
				onClick={() => {
					presses += 1;
				}}
			>
				Replay case
			</Button>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Replay case" }));

		expect(presses).toBe(1);
	});

	it("ignores a press while disabled", () => {
		let presses = 0;
		render(
			<Button
				disabled
				onClick={() => {
					presses += 1;
				}}
			>
				Replay case
			</Button>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Replay case" }));

		expect(presses).toBe(0);
	});

	it("renders the child element in place of a button when asChild is set", () => {
		render(
			<Button asChild>
				<a href="/runs">Back to runs</a>
			</Button>,
		);

		expect(
			screen.getByRole("link", { name: "Back to runs" }),
		).toBeInTheDocument();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});
});
