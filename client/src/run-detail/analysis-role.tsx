import type { AnalysisRole } from "./analysis-query";

/** SPEC.md 4c item 3: the glyph each role an analysis gives a step carries. */
export const ROLE_GLYPHS = {
	"not a factor": "·",
	"contributing factor": "~",
	"root cause": "✕",
	"never ran": "○",
} as const satisfies Record<AnalysisRole, string>;

const ROLE_COLOURS = {
	"not a factor": "text-dim",
	"contributing factor": "text-secondary-foreground",
	"root cause": "text-bright",
	"never ran": "text-subdued",
} as const satisfies Record<AnalysisRole, string>;

/** A role as its glyph, with its words for a screen reader or shown beside it. */
export function RoleMark({
	role,
	words,
}: {
	readonly role: AnalysisRole;
	readonly words: "shown" | "spoken";
}): React.JSX.Element {
	return (
		<span className={ROLE_COLOURS[role]}>
			<span aria-hidden="true">{ROLE_GLYPHS[role]}</span>
			{words === "shown" ? " " : null}
			<span className={words === "shown" ? undefined : "sr-only"}>{role}</span>
		</span>
	);
}
