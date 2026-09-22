export function Notice({
	message,
	items,
}: {
	readonly message: string;
	readonly items: readonly string[];
}): React.JSX.Element {
	return (
		<div
			role="alert"
			className="rounded-lg border border-strong bg-raised px-3 py-2.5 text-secondary-foreground"
		>
			<p>
				<span aria-hidden="true">⚠ </span>
				{message}
			</p>
			<ul className="mt-1.5 flex flex-col gap-1 font-mono text-sm">
				{items.map((item) => (
					<li key={item}>{item}</li>
				))}
			</ul>
		</div>
	);
}
