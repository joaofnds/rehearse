import type { ReactNode } from "react";

export function ScreenHeader({
	title,
	eyebrow,
	subline,
	lead,
	aside,
}: {
	readonly title: string;
	readonly eyebrow?: string;
	readonly subline?: ReactNode;
	readonly lead?: ReactNode;
	readonly aside?: ReactNode;
}): React.JSX.Element {
	return (
		<header className="border-b border-divider px-6 pt-4 pb-3.5">
			{lead === undefined ? null : <div className="mb-3">{lead}</div>}
			<div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
				<div>
					{eyebrow === undefined ? null : (
						<p className="mb-1 text-10 tracking-label text-accent-foreground uppercase">
							{eyebrow}
						</p>
					)}
					<h1 className="text-20 font-medium tracking-tight">{title}</h1>
					{subline === undefined ? null : (
						<p className="mt-1 text-12 text-muted-foreground">{subline}</p>
					)}
				</div>
				{aside}
			</div>
		</header>
	);
}
