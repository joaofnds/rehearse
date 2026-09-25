export const STATUS_STATES = [
	"accepted",
	"running",
	"queued",
	"stopped",
	"interrupted",
	"fired",
	"clear",
	"clean",
	"stale",
	"superseded",
	"pending",
	"checkpoint-present",
	"checkpoint-absent",
] as const;

export type StatusState = (typeof STATUS_STATES)[number];

export const STATUS_VOCABULARY = {
	accepted: { glyph: "✓", word: "accepted" },
	running: { glyph: "●", word: "running" },
	queued: { glyph: "○", word: "queued" },
	stopped: { glyph: "◼", word: "stopped" },
	interrupted: { glyph: "⊘", word: "interrupted" },
	fired: { glyph: "✕", word: "fired" },
	clear: { glyph: "✓", word: "clear" },
	clean: { glyph: "✓", word: "clean" },
	stale: { glyph: "⚠", word: "stale" },
	superseded: { glyph: "⚠", word: "superseded" },
	pending: { glyph: "◌", word: "pending" },
	"checkpoint-present": { glyph: "◆", word: "checkpoint present" },
	"checkpoint-absent": { glyph: "◇", word: "checkpoint absent" },
} satisfies Record<StatusState, { glyph: string; word: string }>;

/**
 * The glyph and its word, at whatever size and colour the surrounding text
 * sets, except that a running glyph takes the light accent and pulses unless
 * the reader asked for reduced motion.
 */
export function Status({
	state,
}: {
	readonly state: StatusState;
}): React.JSX.Element {
	const { glyph, word } = STATUS_VOCABULARY[state];

	return (
		<span className="inline-flex items-center gap-1.5">
			{state === "running" ? (
				<span
					aria-hidden="true"
					className="animate-live text-accent-foreground motion-reduce:animate-none"
				>
					{glyph}
				</span>
			) : (
				<span aria-hidden="true">{glyph}</span>
			)}
			<span>{word}</span>
		</span>
	);
}
