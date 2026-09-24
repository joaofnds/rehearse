import {
	Activity,
	Box,
	FileText,
	GitCompare,
	List,
	Scale,
	Scroll,
	SlidersHorizontal,
	Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Which collection a nav item's badge counts. The shell reads the same query
 * the screen behind the item reads, so a badge cannot disagree with the list
 * it links to (SPEC.md:78).
 */
export type BadgeSource = "runs" | "corpus" | "comparisons";

/**
 * One count per badge source, so a source named on a nav item always has a
 * place to read its number from.
 */
export type BadgeCounts = Readonly<Record<BadgeSource, number | undefined>>;

/**
 * A nav item is live when it carries a `path` and planned when it does not.
 * The router is not registered for typed paths, so a path naming no route
 * would compile and ship as a link onto the not-found page. A test checks
 * each one against the route tree instead.
 */
export interface NavItem {
	readonly label: string;
	readonly icon: LucideIcon;
	readonly path?: string;
	readonly badge?: BadgeSource;
}

/**
 * The nine items of SPEC.md:68-76, in the design's order and labels.
 */
export const NAV_ITEMS: readonly NavItem[] = [
	{ label: "Run history", icon: List, path: "/", badge: "runs" },
	{ label: "Live monitor", icon: Activity },
	{ label: "Run detail", icon: FileText },
	{
		label: "Comparisons",
		icon: GitCompare,
		path: "/comparisons",
		badge: "comparisons",
	},
	{ label: "Corpus", icon: Scroll, path: "/corpus", badge: "corpus" },
	{ label: "Tasks", icon: Workflow },
	{ label: "Cases", icon: Box },
	{ label: "Calibration", icon: Scale },
	{ label: "Settings", icon: SlidersHorizontal },
];
