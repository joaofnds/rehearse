import { STATUS_VOCABULARY } from "#client/system/components/status";

/** A pane's words for what it has nothing of yet, as the design's pending verdict reads. */
export function PendingLine({
	words,
}: {
	readonly words: string;
}): React.JSX.Element {
	return (
		<p className="flex items-center gap-2.25 font-sans">
			<span aria-hidden="true" className="text-11 text-dim">
				{STATUS_VOCABULARY.pending.glyph}
			</span>
			<span className="text-13 text-secondary-foreground">{words}</span>
		</p>
	);
}
