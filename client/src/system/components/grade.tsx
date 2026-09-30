/**
 * The roles docs/design-handoff/SPEC.md gives a grade: inline in a table,
 * on a graph node, on a grade card, and as a task's overall grade.
 */
export const GRADE_SIZES = ["inline", "node", "card", "task"] as const;

export type GradeSize = (typeof GRADE_SIZES)[number];

export type GradeValue =
	| { readonly letter: string }
	| { readonly pending: true };

const SIZE_CLASSES = {
	inline: "font-mono text-13 font-bold",
	node: "font-mono text-19 leading-none font-bold",
	card: "font-mono text-24 font-bold",
	task: "font-mono text-30 font-bold",
} as const satisfies Record<GradeSize, string>;

export function Grade({
	value,
	size,
}: {
	readonly value: GradeValue;
	readonly size: GradeSize;
}): React.JSX.Element {
	return (
		<span className={SIZE_CLASSES[size]}>
			{"pending" in value ? "—" : value.letter}
		</span>
	);
}
