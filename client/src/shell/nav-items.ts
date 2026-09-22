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
 * A nav item is live when `path` names a route the router serves, and planned
 * otherwise. A screen joins the nav by gaining a route, not by an edit here.
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
