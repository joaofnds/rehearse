import type { ReactNode } from "react";
import { SectionLabel } from "#client/system/components/section-label";

export function PaneHeading({
	children,
}: {
	readonly children: ReactNode;
}): React.JSX.Element {
	return (
		<h2 className="border-b px-3 py-3">
			<SectionLabel>{children}</SectionLabel>
		</h2>
	);
}
