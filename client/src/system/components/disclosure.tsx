import type { ReactNode } from "react";
import { useState } from "react";

export function Disclosure({
	collapsedLabel,
	expandedLabel,
	children,
}: {
	readonly collapsedLabel: string;
	readonly expandedLabel: string;
	readonly children: ReactNode;
}): React.JSX.Element {
	const [expanded, setExpanded] = useState(false);

	return (
		<span className="flex flex-col items-start gap-1">
			<button
				type="button"
				className="flex items-start text-left text-14 text-link underline decoration-link/60 underline-offset-4 hover:text-link-hover"
				aria-expanded={expanded}
				onClick={() => {
					setExpanded(!expanded);
				}}
			>
				{expanded ? expandedLabel : collapsedLabel}
			</button>
			{expanded ? children : null}
		</span>
	);
}
