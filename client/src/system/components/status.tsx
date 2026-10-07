export const STATUS_STATES = [
	"accepted",
	"running",
	"queued",
	"stopped",
	"paused",
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
	paused: { glyph: "‖", word: "paused" },
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
 * The running glyph, pulsing unless the reader asked for reduced motion. It
 * takes the light accent unless its tone keeps the surrounding text's colour,
 * as the design's task graph nodes do.
 */
export function LiveGlyph({
	tone = "accent",
}: {
	readonly tone?: "accent" | "surrounding";
}): React.JSX.Element {
	return (
		<span
			aria-hidden="true"
			className={`animate-live motion-reduce:animate-none ${tone === "accent" ? "text-accent-foreground" : ""}`}
		>
			{STATUS_VOCABULARY.running.glyph}
		</span>
	);
}

/**
 * The glyph and its word, at whatever size and colour the surrounding text
 * sets, except that a running glyph takes the light accent and pulses unless
 * the reader asked for reduced motion. A label puts a phrase in the word's
 * place, as a record's outcome does.
 */
export function Status({
	state,
	label,
}: {
	readonly state: StatusState;
	readonly label?: string;
}): React.JSX.Element {
	const { glyph, word } = STATUS_VOCABULARY[state];

	return (
		<span className="inline-flex items-center gap-1.5">
			{state === "running" ? (
				<LiveGlyph />
			) : (
				<span aria-hidden="true">{glyph}</span>
			)}
			<span>{label ?? word}</span>
		</span>
	);
}
