import type { ReactNode } from "react";
import { cn } from "#client/system/cn";

export function SummaryPanel({
	id,
	title,
	description,
	actions,
	children,
	className,
}: {
	readonly id?: string;
	readonly title: string;
	readonly description?: ReactNode;
	readonly actions?: ReactNode;
	readonly children: ReactNode;
	readonly className?: string;
}): React.JSX.Element {
	return (
		<section
			id={id}
			aria-label={title}
			className={cn(
				"min-w-0 rounded-lg border border-divider bg-card p-5",
				className,
			)}
		>
			<header className="mb-4 flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<h2 className="text-16 font-semibold">{title}</h2>
					{description === undefined ? null : (
						<p className="mt-1 text-14 text-muted-foreground">{description}</p>
					)}
				</div>
				{actions}
			</header>
			{children}
		</section>
	);
}
