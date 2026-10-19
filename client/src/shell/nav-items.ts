import type { LucideIcon } from "lucide-react";
import { Box, GitCompare, List, Scroll, SlidersHorizontal } from "lucide-react";

/**
 * Which collection a nav item's badge counts, the one the screen behind the
 * item lists, so a badge agrees with that list once readings settle
 * (SPEC.md:78). Run history's badge reads the run listing rather than the
 * screen's full report, and the two answer the same records and launches.
 */
type BadgeSource = "runs" | "corpus" | "comparisons";

/**
 * One count per badge source, so a source named on a nav item always has a
 * place to read its number from.
 */
type BadgeCounts = Readonly<Record<BadgeSource, number | undefined>>;

/**
 * The router is not registered for typed paths, so a `path` naming no route
 * would compile and ship as a link onto the not-found page. A test checks
 * each one against the route tree instead.
 */
interface NavItem {
	readonly label: string;
	readonly icon: LucideIcon;
	readonly path: string;
	readonly badge?: BadgeSource;
}

/**
 * The desktop workspace groups secondary tools under Cases and Settings.
 */
const NAV_ITEMS: readonly NavItem[] = [
	{ badge: "runs", icon: List, label: "Runs", path: "/" },
	{
		badge: "comparisons",
		icon: GitCompare,
		label: "Comparisons",
		path: "/comparisons",
	},
	{ icon: Box, label: "Cases", path: "/cases" },
	{ badge: "corpus", icon: Scroll, label: "Corpus", path: "/corpus" },
	{ icon: SlidersHorizontal, label: "Settings", path: "/settings" },
];

export { NAV_ITEMS as default };
export type { BadgeCounts, BadgeSource, NavItem };
