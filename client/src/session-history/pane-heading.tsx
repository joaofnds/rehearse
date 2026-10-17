import type { ReactNode } from "react";

export function PaneHeading({
	children,
}: {
	readonly children: ReactNode;
}): React.JSX.Element {
	return (
		<h2 className="border-b px-3 py-2.5 text-16 font-semibold text-secondary-foreground">
			{children}
		</h2>
	);
}
