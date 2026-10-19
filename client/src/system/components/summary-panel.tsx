import type { ReactNode } from "react";

import cn from "#client/system/cn";

interface SummaryPanelProps {
	readonly id?: string;
	readonly title: string;
	readonly description?: ReactNode;
	readonly actions?: ReactNode;
	readonly children: ReactNode;
	readonly className?: string;
}

function SummaryPanel({
	id,
	title,
	description,
	actions,
	children,
	className,
}: SummaryPanelProps): React.JSX.Element {
	return (
		<section
			id={id}
			aria-label={title}
			className={cn(
				"min-w-0 rounded-lg border border-divider bg-card p-6",
				className,
			)}
		>
			<header className="mb-5 flex flex-wrap items-start justify-between gap-4">
				<div className="min-w-0">
					<h2 className="text-16 font-semibold">{title}</h2>
					{description === undefined ? null : (
						<p className="mt-2 max-w-prose text-14 leading-reading text-muted-foreground">
							{description}
						</p>
					)}
				</div>
				{actions}
			</header>
			{children}
		</section>
	);
}

export { SummaryPanel as default };
