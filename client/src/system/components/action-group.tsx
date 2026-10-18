import type { ReactNode } from "react";
import { cn } from "#client/system/cn";

export function ActionGroup({
	children,
	className,
}: {
	readonly children: ReactNode;
	readonly className?: string;
}): React.JSX.Element {
	return (
		<div
			className={cn(
				"flex min-w-0 max-w-full flex-wrap items-center gap-2",
				className,
			)}
		>
			{children}
		</div>
	);
}
