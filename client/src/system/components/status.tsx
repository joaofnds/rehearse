const STATUS_STATES = [
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

type StatusState = (typeof STATUS_STATES)[number];

const STATUS_VOCABULARY = {
	accepted: { glyph: "✓", word: "accepted" },
	"checkpoint-absent": { glyph: "◇", word: "checkpoint absent" },
	"checkpoint-present": { glyph: "◆", word: "checkpoint present" },
	clean: { glyph: "✓", word: "clean" },
	clear: { glyph: "✓", word: "clear" },
	fired: { glyph: "✕", word: "fired" },
	interrupted: { glyph: "⊘", word: "interrupted" },
	paused: { glyph: "‖", word: "paused" },
	pending: { glyph: "◌", word: "pending" },
	queued: { glyph: "○", word: "queued" },
	running: { glyph: "●", word: "running" },
	stale: { glyph: "⚠", word: "stale" },
	stopped: { glyph: "◼", word: "stopped" },
	superseded: { glyph: "⚠", word: "superseded" },
} satisfies Record<StatusState, { glyph: string; word: string }>;

/**
 * The running glyph, pulsing unless the reader asked for reduced motion. It
 * takes the light accent unless its tone keeps the surrounding text's colour,
 * as the design's task graph nodes do.
 */
interface LiveGlyphProps {
	readonly tone?: "accent" | "surrounding";
}

function LiveGlyph({ tone = "accent" }: LiveGlyphProps): React.JSX.Element {
	return (
		<span
			aria-hidden="true"
			className={`animate-live motion-reduce:animate-none ${tone === "accent" ? "text-info" : ""}`}
		>
			{STATUS_VOCABULARY.running.glyph}
		</span>
	);
}

const TONE_CLASSES = {
	attention: "text-attention",
	info: "text-info",
	negative: "text-negative",
	neutral: "",
	positive: "text-positive",
} as const;

type StatusTone = keyof typeof TONE_CLASSES;

const STATE_TONES = {
	accepted: "neutral",
	"checkpoint-absent": "neutral",
	"checkpoint-present": "neutral",
	clean: "neutral",
	clear: "neutral",
	fired: "negative",
	interrupted: "attention",
	paused: "attention",
	pending: "neutral",
	queued: "neutral",
	running: "info",
	stale: "attention",
	stopped: "attention",
	superseded: "attention",
} as const satisfies Readonly<Record<StatusState, StatusTone>>;

/**
 * The glyph and its word, at whatever size and colour the surrounding text
 * sets, except that a running glyph takes the light accent and pulses unless
 * the reader asked for reduced motion. A label puts a phrase in the word's
 * place, as a record's outcome does.
 */
interface StatusProps {
	readonly state: StatusState;
	readonly label?: string;
	readonly tone?: StatusTone | undefined;
}

function Status({ state, label, tone }: StatusProps): React.JSX.Element {
	const { glyph, word } = STATUS_VOCABULARY[state];

	return (
		<span
			className={`inline-flex items-center gap-1.5 ${TONE_CLASSES[tone ?? STATE_TONES[state]]}`}
		>
			{state === "running" ? (
				<LiveGlyph />
			) : (
				<span aria-hidden="true">{glyph}</span>
			)}
			<span>{label ?? word}</span>
		</span>
	);
}

export { LiveGlyph, STATUS_STATES, STATUS_VOCABULARY, Status };
export type { StatusState, StatusTone };
