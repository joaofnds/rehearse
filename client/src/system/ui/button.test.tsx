import { describe, expect, it } from "bun:test";

import { fireEvent, render, screen } from "@testing-library/react";

import { Button } from "./button";

const BUTTON_PRESS_COUNT_INCREMENT = 1;

describe(Button.name, () => {
	it(
		"renders a button carrying its accessible name",
		rendersAButtonCarryingItsAccessibleName,
	);

	it("calls onClick when pressed", callsOnClickWhenPressed);

	it("ignores a press while disabled", ignoresAPressWhileDisabled);

	it.each(["default", "outline", "quiet", "strong", "ghost", "link"] as const)(
		"keeps a %s button's hover and press fills off while aria-disabled, as the design does",
		keepsDisabledVariantsUnfilled,
	);

	it(
		"renders the child element in place of a button when asChild is set",
		rendersTheChildElementInPlaceOfAButtonWhenAsChildIsSet,
	);

	it.each([
		["xs", "text-14"],
		["compact", "text-14"],
	] as const)(
		"keeps the variant's text colour beside the %s size's type step",
		retainsVariantColorBesideTypeSize,
	);

	it(
		"rounds the xs size at the tight radius in place of the button radius",
		roundsTheXsSizeAtTheTightRadiusInPlaceOfTheButtonRadius,
	);

	it.each(["default", "outline", "quiet", "strong"] as const)(
		"tints the %s variant while pressed at the design's pressed tint",
		tintsPressedVariant,
	);
});

function rendersAButtonCarryingItsAccessibleName(): void {
	render(<Button>Replay case</Button>);

	expect(
		screen.getByRole("button", { name: "Replay case" }),
	).toBeInTheDocument();
}

function callsOnClickWhenPressed(): void {
	const expectedPresses = 1;

	let presses = 0;
	render(
		<Button
			onClick={() => {
				presses += BUTTON_PRESS_COUNT_INCREMENT;
			}}
		>
			Replay case
		</Button>,
	);

	fireEvent.click(screen.getByRole("button", { name: "Replay case" }));

	expect(presses).toBe(expectedPresses);
}

function ignoresAPressWhileDisabled(): void {
	const expectedPresses = 0;

	let presses = 0;
	render(
		<Button
			disabled
			onClick={() => {
				presses += BUTTON_PRESS_COUNT_INCREMENT;
			}}
		>
			Replay case
		</Button>,
	);

	fireEvent.click(screen.getByRole("button", { name: "Replay case" }));

	expect(presses).toBe(expectedPresses);
}

function rendersTheChildElementInPlaceOfAButtonWhenAsChildIsSet(): void {
	render(
		<Button asChild>
			<a href="/runs">Back to runs</a>
		</Button>,
	);

	expect(
		screen.getByRole("link", { name: "Back to runs" }),
	).toBeInTheDocument();
	expect(screen.queryByRole("button")).not.toBeInTheDocument();
}

function roundsTheXsSizeAtTheTightRadiusInPlaceOfTheButtonRadius(): void {
	render(<Button size="xs">replay</Button>);

	const button = screen.getByRole("button", { name: "replay" });

	expect(button).toHaveClass("rounded-tight");
	expect(button).not.toHaveClass("rounded-md");
}

function keepsDisabledVariantsUnfilled(
	variant: NonNullable<React.ComponentProps<typeof Button>["variant"]>,
): void {
	const lowerBoundForFillsCount = 0;

	render(
		<Button variant={variant} aria-disabled="true">
			Stop
		</Button>,
	);

	const fills = [...screen.getByRole("button").classList].filter(
		(name) => name.includes("hover:") || name.includes("active:"),
	);

	expect(screen.getByRole("button")).toHaveClass(
		"aria-disabled:cursor-not-allowed",
	);
	expect(fills.length).toBeGreaterThan(lowerBoundForFillsCount);
	expect(
		fills.filter((name) => !name.startsWith("not-aria-disabled:")),
	).toEqual([]);
}

function retainsVariantColorBesideTypeSize(
	size: NonNullable<React.ComponentProps<typeof Button>["size"]>,
	typeStep: string,
): void {
	render(
		<Button variant="quiet" size={size}>
			replay
		</Button>,
	);

	expect(screen.getByRole("button", { name: "replay" })).toHaveClass(
		"text-secondary-foreground",
		typeStep,
	);
}

function tintsPressedVariant(
	variant: NonNullable<React.ComponentProps<typeof Button>["variant"]>,
): void {
	render(<Button variant={variant}>replay</Button>);

	expect(screen.getByRole("button", { name: "replay" })).toHaveClass(
		"not-aria-disabled:active:bg-pressed",
	);
}
