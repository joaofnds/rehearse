import { Box, GitCompare, List, Scroll, SlidersHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Which collection a nav item's badge counts, the one the screen behind the
 * item lists, so a badge agrees with that list once readings settle
 * (SPEC.md:78). Run history's badge reads the run listing rather than the
 * screen's full report, and the two answer the same records and launches.
 */
export type BadgeSource = "runs" | "corpus" | "comparisons";

/**
 * One count per badge source, so a source named on a nav item always has a
 * place to read its number from.
 */
export type BadgeCounts = Readonly<Record<BadgeSource, number | undefined>>;

/**
 * The router is not registered for typed paths, so a `path` naming no route
 * would compile and ship as a link onto the not-found page. A test checks
 * each one against the route tree instead.
 */
export interface NavItem {
	readonly label: string;
	readonly icon: LucideIcon;
	readonly path: string;
	readonly badge?: BadgeSource;
}

/**
 * The desktop workspace groups secondary tools under Cases and Settings.
 */
export const NAV_ITEMS: readonly NavItem[] = [
	{ label: "Runs", icon: List, path: "/", badge: "runs" },
	{
		label: "Comparisons",
		icon: GitCompare,
		path: "/comparisons",
		badge: "comparisons",
	},
	{ label: "Cases", icon: Box, path: "/cases" },
	{ label: "Corpus", icon: Scroll, path: "/corpus", badge: "corpus" },
	{ label: "Settings", icon: SlidersHorizontal, path: "/settings" },
];
