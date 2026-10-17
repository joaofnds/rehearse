/** The key a shortcut answers to, beside the action it triggers. Assistive tech reads `aria-keyshortcuts` instead. */
export function KeyHint({
	letter,
}: {
	readonly letter: string;
}): React.JSX.Element {
	return (
		<kbd aria-hidden="true" className="font-mono text-12 text-dim uppercase">
			{letter}
		</kbd>
	);
}
