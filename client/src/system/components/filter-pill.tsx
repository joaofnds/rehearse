import type { ReactNode } from "react";

export function FilterPill({
	pressed,
	onPress,
	children,
}: {
	readonly pressed: boolean;
	readonly onPress: () => void;
	readonly children: ReactNode;
}): React.JSX.Element {
	return (
		<button
			type="button"
			aria-pressed={pressed}
			onClick={onPress}
			className="rounded-md border border-transparent bg-muted px-3 py-1 text-14 text-secondary-foreground transition-colors hover:bg-row-hover aria-pressed:border-accent-line/50 aria-pressed:bg-selected aria-pressed:text-pale aria-pressed:font-medium aria-pressed:underline aria-pressed:decoration-primary aria-pressed:decoration-2 aria-pressed:underline-offset-8"
		>
			{children}
		</button>
	);
}
