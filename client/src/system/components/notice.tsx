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
			className="min-w-0 rounded-lg border border-attention/40 border-l-3 border-l-attention bg-attention-surface px-3 py-2.5 wrap-anywhere text-attention"
		>
			<p>
				<span aria-hidden="true">⚠ </span>
				{message}
			</p>
			<ul className="mt-1.5 flex flex-col gap-1 font-mono text-14">
				{items.map((item) => (
					<li key={item}>{item}</li>
				))}
			</ul>
			{children}
		</div>
	);
}
