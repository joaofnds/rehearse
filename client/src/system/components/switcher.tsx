export function Switcher<Option extends string>({
	label,
	options,
	selected,
	onSelect,
}: {
	readonly label: string;
	readonly options: readonly Option[];
	readonly selected: Option;
	readonly onSelect: (option: Option) => void;
}): React.JSX.Element {
	return (
		<div
			role="group"
			aria-label={label}
			className="inline-flex overflow-hidden rounded-md border border-strong"
		>
			{options.map((option) => (
				<button
					key={option}
					type="button"
					className="border-r border-strong px-3 py-1.5 text-sm text-secondary-foreground transition-colors last:border-r-0 hover:bg-row-hover aria-pressed:bg-selected aria-pressed:text-foreground"
					aria-pressed={option === selected}
					onClick={() => {
						onSelect(option);
					}}
				>
					{option}
				</button>
			))}
		</div>
	);
}
