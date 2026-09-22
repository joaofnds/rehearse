import {
	CubeIcon,
	FileTextIcon,
	GitDiffIcon,
	GraphIcon,
	ListDashesIcon,
	PulseIcon,
	ScalesIcon,
	ScrollIcon,
	SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

/**
 * Which collection a nav item's badge counts. The shell reads the same query
 * the screen behind the item reads, so a badge cannot disagree with the list
 * it links to (SPEC.md:78).
 */
export type BadgeSource = "runs" | "corpus";

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
	readonly icon: Icon;
	readonly path?: string;
	readonly badge?: BadgeSource;
}

/**
 * The nine items of SPEC.md:68-76, in the design's order and labels. The
 * design names `ph-activity` for Live monitor, which this version of the
 * package ships as `Pulse`.
 */
export const NAV_ITEMS: readonly NavItem[] = [
	{ label: "Run history", icon: ListDashesIcon, path: "/", badge: "runs" },
	{ label: "Live monitor", icon: PulseIcon },
	{ label: "Run detail", icon: FileTextIcon },
	{ label: "Comparisons", icon: GitDiffIcon },
	{ label: "Corpus", icon: ScrollIcon, path: "/corpus", badge: "corpus" },
	{ label: "Tasks", icon: GraphIcon },
	{ label: "Cases", icon: CubeIcon },
	{ label: "Calibration", icon: ScalesIcon },
	{ label: "Settings", icon: SlidersHorizontalIcon },
];
