/** The key a shortcut answers to, beside the action it triggers. Assistive tech reads `aria-keyshortcuts` instead. */
export function KeyHint({
	letter,
	decorative = true,
}: {
	readonly letter: string;
	readonly decorative?: boolean;
}): React.JSX.Element {
	return (
		<kbd
			aria-hidden={decorative}
			className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-sm border border-current/25 bg-background/10 px-1.5 font-mono text-12 leading-none uppercase"
		>
			{letter}
		</kbd>
	);
}
