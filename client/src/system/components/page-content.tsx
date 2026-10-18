import type { ReactNode } from "react";
import { cn } from "#client/system/cn";

export function PageContent({
	children,
	className,
}: {
	readonly children: ReactNode;
	readonly className?: string;
}): React.JSX.Element {
	return (
		<div
			className={cn(
				"flex min-w-0 flex-col gap-6 page-gutter pt-8 pb-12",
				className,
			)}
		>
			{children}
		</div>
	);
}
