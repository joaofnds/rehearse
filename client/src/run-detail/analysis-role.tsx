import type { AnalysisRole } from "./analysis-query";

/** SPEC.md 4c item 3: the glyph each role an analysis gives a step carries. */
const ROLE_GLYPHS = {
	"contributing factor": "~",
	"never ran": "○",
	"not a factor": "·",
	"root cause": "✕",
} as const satisfies Record<AnalysisRole, string>;

const ROLE_COLOURS = {
	"contributing factor": "text-secondary-foreground",
	"never ran": "text-subdued",
	"not a factor": "text-dim",
	"root cause": "text-bright",
} as const satisfies Record<AnalysisRole, string>;

/** A role as its glyph, with its words for a screen reader or shown beside it. */
interface RoleMarkProps {
	readonly role: AnalysisRole;
	readonly words: "shown" | "spoken";
}

function RoleMark({ role, words }: RoleMarkProps): React.JSX.Element {
	return (
		<span className={ROLE_COLOURS[role]}>
			<span aria-hidden="true">{ROLE_GLYPHS[role]}</span>
			{words === "shown" ? " " : null}
			<span className={words === "shown" ? undefined : "sr-only"}>{role}</span>
		</span>
	);
}

export { ROLE_GLYPHS, RoleMark };
