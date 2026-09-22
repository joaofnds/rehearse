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
			className="rounded-full border border-strong px-3 py-1 text-sm text-secondary-foreground transition-colors hover:border-primary hover:bg-accent aria-pressed:border-primary aria-pressed:bg-selected aria-pressed:text-pale"
		>
			{children}
		</button>
	);
}
