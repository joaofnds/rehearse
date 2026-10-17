import type { ComponentProps } from "react";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { cn } from "#client/system/cn";
import { Slot } from "radix-ui";

const buttonVariants = cva(
	"inline-flex shrink-0 items-center justify-center gap-2 rounded-md border min-h-touch-target min-w-touch-target text-14 no-underline whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3 disabled:pointer-events-none disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				primary:
					"border-primary bg-primary text-primary-foreground font-semibold [&_kbd]:text-current not-aria-disabled:hover:bg-primary-hover not-aria-disabled:active:bg-primary",
				destructive:
					"border-negative bg-negative-surface text-negative not-aria-disabled:hover:bg-negative-surface not-aria-disabled:active:bg-negative-surface",
				default:
					"border-strong bg-card text-foreground not-aria-disabled:hover:bg-row-hover not-aria-disabled:active:bg-pressed",
				outline:
					"border-strong text-foreground not-aria-disabled:hover:border-primary not-aria-disabled:hover:bg-accent not-aria-disabled:active:bg-pressed",
				quiet:
					"border-strong text-secondary-foreground not-aria-disabled:hover:border-primary not-aria-disabled:hover:bg-accent not-aria-disabled:active:bg-pressed",
				strong:
					"border-stronger text-bright not-aria-disabled:hover:border-primary not-aria-disabled:hover:bg-accent not-aria-disabled:active:bg-pressed",
				ghost: "border-transparent not-aria-disabled:hover:bg-accent",
				link: "border-transparent text-link underline underline-offset-4 not-aria-disabled:hover:underline",
			},
			size: {
				default: "h-9 px-4",
				sm: "h-8 gap-1.5 px-3",
				lg: "h-10 px-6",
				icon: "size-9",
				"icon-sm": "size-8",
				xs: "rounded-tight px-2.25 py-1.25 text-14",
				compact: "px-3 py-1.25 text-14",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
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
	asChild = false,
	...props
}: ButtonProps): React.JSX.Element {
	const Comp = asChild ? Slot.Root : "button";

	return (
		<Comp
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
export type { ButtonProps };
