import type { ReactNode } from "react";

export function SectionLabel({
	children,
}: {
	readonly children: ReactNode;
}): React.JSX.Element {
	return (
		<span className="text-xs tracking-widest text-dim uppercase">
			{children}
		</span>
	);
}
