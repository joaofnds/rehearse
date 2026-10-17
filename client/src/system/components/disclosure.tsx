import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

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
		<span className="flex min-w-0 flex-col items-start gap-2">
			<button
				type="button"
				className="inline-flex min-h-touch-target items-center gap-1.5 text-left text-14 text-link underline decoration-link/60 underline-offset-4 hover:text-link-hover"
				aria-expanded={expanded}
				onClick={() => {
					setExpanded(!expanded);
				}}
			>
				{expanded ? (
					<ChevronDown aria-hidden="true" className="size-4 shrink-0" />
				) : (
					<ChevronRight aria-hidden="true" className="size-4 shrink-0" />
				)}
				{expanded ? expandedLabel : collapsedLabel}
			</button>
			{expanded ? children : null}
		</span>
	);
}
