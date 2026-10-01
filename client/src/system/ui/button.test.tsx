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

	it.each(["default", "outline", "quiet", "strong", "ghost"] as const)(
		"keeps a %s button's hover and press fills off while aria-disabled, as the design does",
		(variant) => {
			render(
				<Button variant={variant} aria-disabled="true">
					Stop
				</Button>,
			);

			const fills = [...screen.getByRole("button").classList].filter((name) =>
				/^(hover|active):/u.test(name),
			);

			expect(fills).toEqual([]);
		},
	);

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

	it.each([
		["xs", "text-10-5"],
		["compact", "text-11-5"],
	] as const)(
		"keeps the variant's text colour beside the %s size's type step",
		(size, typeStep) => {
			render(
				<Button variant="quiet" size={size}>
					replay
				</Button>,
			);

			expect(screen.getByRole("button", { name: "replay" })).toHaveClass(
				"text-secondary-foreground",
				typeStep,
			);
		},
	);

	it("rounds the xs size at the tight radius in place of the button radius", () => {
		render(<Button size="xs">replay</Button>);

		const button = screen.getByRole("button", { name: "replay" });

		expect(button).toHaveClass("rounded-tight");
		expect(button).not.toHaveClass("rounded-md");
	});

	it.each(["default", "outline", "quiet", "strong"] as const)(
		"tints the %s variant while pressed at the design's pressed tint",
		(variant) => {
			render(<Button variant={variant}>replay</Button>);

			expect(screen.getByRole("button", { name: "replay" })).toHaveClass(
				"not-aria-disabled:active:bg-pressed",
			);
		},
	);
});
