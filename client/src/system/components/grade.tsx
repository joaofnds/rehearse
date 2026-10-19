const INITIAL_CHARACTER_INDEX = 0;

/**
 * The roles docs/design-handoff/SPEC.md gives a grade: inline in a table,
 * on a graph node, on the judge pane's verdict card, on a grade card, and as
 * a task's overall grade.
 */
const GRADE_SIZES = ["inline", "node", "verdict", "card", "task"] as const;

type GradeSize = (typeof GRADE_SIZES)[number];

type GradeValue = { readonly letter: string } | { readonly pending: true };

const SIZE_CLASSES = {
	card: "font-mono text-24 font-bold",
	inline: "font-mono text-14 font-bold",
	node: "font-mono text-19 leading-none font-bold",
	task: "font-mono text-30 font-bold",
	verdict: "font-mono text-22 font-bold",
} as const satisfies Record<GradeSize, string>;

/** The colours prototype.html's gradeColor gives a letter; D and F are bright. */
const LETTER_COLOURS = new Map([
	["A", "text-pale"],
	["B", "text-foreground"],
	["C", "text-secondary-foreground"],
]);

function gradeColour(value: GradeValue): string {
	return "pending" in value
		? "text-subdued"
		: (LETTER_COLOURS.get(value.letter.charAt(INITIAL_CHARACTER_INDEX)) ??
				"text-bright");
}

interface GradeProps {
	readonly value: GradeValue;
	readonly size: GradeSize;
}

function Grade({ value, size }: GradeProps): React.JSX.Element {
	return (
		<span className={`${SIZE_CLASSES[size]} ${gradeColour(value)}`}>
			{"pending" in value ? "—" : value.letter}
		</span>
	);
}

export { GRADE_SIZES, Grade };
export type { GradeSize, GradeValue };
