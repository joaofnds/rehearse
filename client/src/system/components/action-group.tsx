import type { ReactNode } from "react";

import cn from "#client/system/cn";

interface ActionGroupProps {
	readonly children: ReactNode;
	readonly className?: string;
}

function ActionGroup({
	children,
	className,
}: ActionGroupProps): React.JSX.Element {
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

export { ActionGroup as default };
