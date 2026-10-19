import type { ReactNode } from "react";

import cn from "#client/system/cn";

interface PageContentProps {
	readonly children: ReactNode;
	readonly className?: string;
}

function PageContent({
	children,
	className,
}: PageContentProps): React.JSX.Element {
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

export { PageContent as default };
