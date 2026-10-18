import type { ReactNode } from "react";

export function Notice({
	message,
	items,
	children,
}: {
	readonly message: string;
	readonly items: readonly string[];
	readonly children?: ReactNode;
}): React.JSX.Element {
	return (
		<div
			role="alert"
			className="min-w-0 rounded-lg border border-attention/20 border-l-3 border-l-attention/60 bg-card px-3 py-2.5 wrap-anywhere text-secondary-foreground"
		>
			<p className="font-medium text-foreground">
				<span aria-hidden="true" className="text-attention">
					⚠{" "}
				</span>
				{message}
			</p>
			<ul className="mt-1.5 flex flex-col gap-1 font-mono text-14 text-muted-foreground">
				{items.map((item) => (
					<li key={item}>{item}</li>
				))}
			</ul>
			{children}
		</div>
	);
}
