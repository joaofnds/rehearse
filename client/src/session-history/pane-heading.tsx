import type { ReactNode } from "react";

interface PaneHeadingProps {
	readonly children: ReactNode;
}

function PaneHeading({ children }: PaneHeadingProps): React.JSX.Element {
	return (
		<h2 className="border-b px-3 py-2.5 text-16 font-semibold text-secondary-foreground">
			{children}
		</h2>
	);
}

export { PaneHeading as default };
