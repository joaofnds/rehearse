import type { ComponentProps } from "react";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";

const buttonVariants = cva(
	"inline-flex shrink-0 items-center justify-center gap-2 rounded-md border text-base whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default: "border-primary text-pale hover:bg-accent active:bg-selected",
				outline:
					"border-strong text-foreground hover:border-primary hover:bg-accent active:bg-selected",
				ghost: "border-transparent hover:bg-accent",
				link: "border-transparent text-accent-foreground underline-offset-4 hover:underline",
			},
			size: {
				default: "h-9 px-4",
				sm: "h-8 gap-1.5 px-3",
				lg: "h-10 px-6",
				icon: "size-9",
				"icon-sm": "size-8",
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
