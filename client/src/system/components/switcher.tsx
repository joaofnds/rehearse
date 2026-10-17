export function Switcher<Option extends string>({
	label,
	options,
	selected,
	onSelect,
	optionLabel = (option) => option,
}: {
	readonly label: string;
	readonly options: readonly Option[];
	readonly selected: Option;
	readonly onSelect: (option: Option) => void;
	/** The words an option shows, when they differ from its value. */
	readonly optionLabel?: (option: Option) => string;
}): React.JSX.Element {
	return (
		<div
			role="group"
			aria-label={label}
			className="inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-divider bg-muted p-1"
		>
			{options.map((option) => (
				<button
					key={option}
					type="button"
					className="rounded-md border border-transparent px-4 py-1.5 text-14 text-secondary-foreground transition-colors hover:bg-row-hover aria-pressed:border-accent-line aria-pressed:bg-selected aria-pressed:text-pale"
					aria-pressed={option === selected}
					onClick={() => {
						onSelect(option);
					}}
				>
					{optionLabel(option)}
				</button>
			))}
		</div>
	);
}
