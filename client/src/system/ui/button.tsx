import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import cn from "#client/system/cn";

const buttonVariants = cva(
	"inline-flex shrink-0 items-center justify-center gap-3 rounded-lg border min-h-touch-target min-w-touch-target text-14 no-underline whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3 disabled:pointer-events-none disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		defaultVariants: {
			size: "default",
			variant: "default",
		},
		variants: {
			size: {
				compact: "px-3 py-1.25 text-14",
				default: "h-9 px-4",
				icon: "size-9",
				"icon-sm": "size-8",
				inline: "px-0 py-1.25 text-14",
				lg: "h-10 px-6",
				sm: "h-8 gap-1.5 px-3",
				xs: "rounded-tight px-2.25 py-1.25 text-14",
			},
			variant: {
				default:
					"border-divider bg-card text-secondary-foreground not-aria-disabled:hover:bg-row-hover not-aria-disabled:active:bg-pressed",
				destructive:
					"border-negative bg-negative-surface text-negative not-aria-disabled:hover:bg-negative-surface not-aria-disabled:active:bg-negative-surface",
				ghost: "border-transparent not-aria-disabled:hover:bg-accent",
				link: "max-w-full border-transparent text-link text-left whitespace-normal underline underline-offset-4 not-aria-disabled:hover:underline",
				outline:
					"border-divider bg-card text-secondary-foreground not-aria-disabled:hover:border-strong not-aria-disabled:hover:bg-row-hover not-aria-disabled:active:bg-pressed",
				primary:
					"border-primary bg-primary text-primary-foreground font-semibold [&_kbd]:text-current not-aria-disabled:hover:bg-primary-hover not-aria-disabled:active:bg-primary",
				quiet:
					"border-divider bg-muted text-secondary-foreground not-aria-disabled:hover:border-strong not-aria-disabled:hover:bg-row-hover not-aria-disabled:active:bg-pressed",
				strong:
					"border-strong text-foreground not-aria-disabled:hover:border-stronger not-aria-disabled:hover:bg-row-hover not-aria-disabled:active:bg-pressed",
			},
			wrap: {
				true: "max-w-full whitespace-normal",
			},
		},
	},
);

type ButtonProps = ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	};

function Button({
	className,
	variant = "default",
	size = "default",
	wrap = false,
	asChild = false,
	...props
}: ButtonProps): React.JSX.Element {
	const Comp = asChild ? Slot.Root : "button";

	return (
		<Comp
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(buttonVariants({ className, size, variant, wrap }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
export type { ButtonProps };
