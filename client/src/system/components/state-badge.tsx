import type { ReactNode } from "react";

import cn from "#client/system/cn";

const TONES = {
	attention: "border-attention/25 bg-attention-surface text-attention",
	negative: "border-negative/25 bg-negative-surface text-negative",
	neutral: "border-divider bg-muted text-secondary-foreground",
	positive: "border-positive/25 bg-positive-surface text-positive",
} as const;

interface StateBadgeProps {
	readonly tone?: keyof typeof TONES;
	readonly children: ReactNode;
}

function StateBadge({
	tone = "neutral",
	children,
}: StateBadgeProps): React.JSX.Element {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-12 leading-snug",
				TONES[tone],
			)}
		>
			{children}
		</span>
	);
}

export { StateBadge as default };
