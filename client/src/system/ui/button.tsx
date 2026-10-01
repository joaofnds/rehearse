import type { ComponentProps } from "react";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { cn } from "#client/system/cn";
import { Slot } from "radix-ui";

const buttonVariants = cva(
	"inline-flex shrink-0 items-center justify-center gap-2 rounded-md border text-base whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-45 aria-disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default:
					"border-primary text-pale not-aria-disabled:hover:bg-accent not-aria-disabled:active:bg-pressed",
				outline:
					"border-strong text-foreground not-aria-disabled:hover:border-primary not-aria-disabled:hover:bg-accent not-aria-disabled:active:bg-pressed",
				quiet:
					"border-strong text-secondary-foreground not-aria-disabled:hover:border-primary not-aria-disabled:hover:bg-accent not-aria-disabled:active:bg-pressed",
				strong:
					"border-stronger text-bright not-aria-disabled:hover:border-primary not-aria-disabled:hover:bg-accent not-aria-disabled:active:bg-pressed",
				ghost: "border-transparent not-aria-disabled:hover:bg-accent",
				link: "border-transparent text-accent-foreground underline-offset-4 hover:underline",
			},
			size: {
				default: "h-9 px-4",
				sm: "h-8 gap-1.5 px-3",
				lg: "h-10 px-6",
				icon: "size-9",
				"icon-sm": "size-8",
				xs: "rounded-tight px-2.25 py-1.25 text-10-5",
				compact: "px-3 py-1.25 text-11-5",
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
