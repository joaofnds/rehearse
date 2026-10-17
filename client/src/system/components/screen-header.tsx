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
		<header className="page-gutter border-b border-divider py-7 sm:py-8">
			{lead === undefined ? null : <div className="mb-3">{lead}</div>}
			<div className="flex min-w-0 flex-wrap items-center justify-between gap-x-8 gap-y-5">
				<div className="min-w-0 w-full sm:w-auto sm:flex-1">
					{eyebrow === undefined ? null : (
						<p className="mb-1 text-12 tracking-label text-accent-foreground uppercase">
							{eyebrow}
						</p>
					)}
					<h1 className="text-24 font-semibold tracking-tight leading-heading">
						{title}
					</h1>
					{subline === undefined ? null : (
						<p className="mt-2 max-w-prose text-14 wrap-anywhere text-muted-foreground">
							{subline}
						</p>
					)}
				</div>
				{aside === undefined ? null : (
					<div className="flex max-w-full flex-wrap items-center gap-3">
						{aside}
					</div>
				)}
			</div>
		</header>
	);
}
