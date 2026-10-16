import type { ReactNode } from "react";

export function SectionLabel({
	children,
}: {
	readonly children: ReactNode;
}): React.JSX.Element {
	return (
		<span className="text-10 tracking-label text-dim uppercase">
			{children}
		</span>
	);
}
