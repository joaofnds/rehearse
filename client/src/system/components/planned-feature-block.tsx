import type { ReactNode } from "react";

export function PlannedFeatureBlock({
	heading,
	children,
}: {
	readonly heading: string;
	readonly children: ReactNode;
}): React.JSX.Element {
	return (
		<section className="overflow-hidden rounded-lg border border-dashed border-deeper opacity-60">
			<header className="flex flex-wrap items-center gap-3 border-b border-dashed border-deeper bg-popover px-4 py-2.5">
				<h2 className="font-medium">{heading}</h2>
				<span className="rounded-full border border-deep px-2 py-0.5 text-xs tracking-widest text-pale">
					PLANNED
				</span>
				<p className="ml-auto text-sm text-muted-foreground">
					Not available in v0.6 — edit on disk for now
				</p>
			</header>
			<div className="px-4 py-3">{children}</div>
		</section>
	);
}
