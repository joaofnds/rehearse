export function AmountInput({
	value,
	onChange,
	accessibleName,
	id,
	prefix = "USD",
}: {
	readonly value: string;
	readonly onChange: (value: string) => void;
	readonly accessibleName: string;
	readonly id?: string;
	readonly prefix?: "USD" | "USD per run";
}): React.JSX.Element {
	return (
		<label className="inline-flex h-touch-target min-w-0 max-w-full items-center gap-2 rounded-md border border-strong bg-background px-3 focus-within:outline-2 focus-within:outline-ring focus-within:outline-offset-3">
			<span
				aria-hidden="true"
				className="shrink-0 text-12 text-muted-foreground"
			>
				{prefix}
			</span>
			<input
				id={id}
				value={value}
				inputMode="decimal"
				aria-label={accessibleName}
				onChange={(event) => {
					onChange(event.target.value);
				}}
				className="h-full min-h-0 min-w-0 w-22 bg-transparent font-mono text-14 outline-none"
			/>
		</label>
	);
}
