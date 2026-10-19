import { useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { useRunsReturnSearch } from "#client/run-history/run-discovery";
import CurrentLink from "#client/system/components/current-link";

import NAV_ITEMS from "./nav-items";
import type { ShellCounts } from "./shell-counts";

const ICON_SIZE = 16;

interface NavEntryProps {
	readonly label: string;
	readonly icon: React.ReactNode;
	readonly path: string;
	readonly count: number | undefined;
	readonly marksCurrent: boolean;
}

function NavEntry({
	label,
	icon,
	path,
	count,
	marksCurrent,
}: NavEntryProps): React.JSX.Element {
	const runsReturnSearch = useRunsReturnSearch();
	return (
		<li>
			<CurrentLink
				to={path}
				search={path === "/" ? runsReturnSearch : {}}
				marksCurrent={marksCurrent}
				className="flex min-h-touch-target shrink-0 items-center gap-3 rounded-lg border-l-2 border-transparent px-3 py-2 text-secondary-foreground no-underline hover:bg-row-hover hover:no-underline current:border-primary current:bg-selected current:text-pale"
			>
				{icon}
				<span className="flex-1 whitespace-nowrap">{label}</span>
				{count === undefined ? null : (
					<span className="font-mono text-12 text-dim">{count}</span>
				)}
			</CurrentLink>
		</li>
	);
}

function sectionFor(path: string): string {
	if (path.startsWith("/comparisons")) {
		return "/comparisons";
	}
	if (path.startsWith("/corpus")) {
		return "/corpus";
	}
	if (path.startsWith("/cases") || path.startsWith("/tasks")) {
		return "/cases";
	}
	if (path.startsWith("/settings") || path.startsWith("/calibration")) {
		return "/settings";
	}
	return "/";
}

interface ShellSectionsProps {
	readonly counts: ShellCounts;
	readonly fresh: boolean;
}

function ShellSections({
	counts,
	fresh,
}: ShellSectionsProps): React.JSX.Element {
	const pathname = useLocation({ select: (location) => location.pathname });
	const section = sectionFor(pathname);
	const sectionsRef = useSectionScrolling(section, fresh, counts);
	return (
		<ul
			ref={sectionsRef}
			className="flex shrink-0 flex-row gap-1 overflow-x-auto p-1 md:flex-col"
		>
			{NAV_ITEMS.map(({ label, icon: NavIcon, path, badge }) => (
				<NavEntry
					key={label}
					label={label}
					icon={
						<NavIcon
							size={ICON_SIZE}
							aria-hidden
							className="flex-none opacity-85"
						/>
					}
					path={path}
					count={badge === undefined ? undefined : counts[badge]}
					marksCurrent={!fresh && section === path}
				/>
			))}
		</ul>
	);
}

function useSectionScrolling(
	section: string,
	fresh: boolean,
	counts: ShellCounts,
): React.RefObject<HTMLUListElement | null> {
	const sectionsRef = useRef<HTMLUListElement>(null);
	useEffect(() => {
		const revealCurrent = (): void => {
			const list = sectionsRef.current;
			const current = list?.querySelector('a[aria-current="page"]');
			if (list === null || current === undefined || current === null) {
				return;
			}

			const bounds = list.getBoundingClientRect();
			const selected = current.getBoundingClientRect();
			if (selected.left < bounds.left) {
				list.scrollLeft += selected.left - bounds.left;
			} else if (selected.right > bounds.right) {
				list.scrollLeft += selected.right - bounds.right;
			}
		};

		revealCurrent();
		window.addEventListener("resize", revealCurrent);
		return () => {
			window.removeEventListener("resize", revealCurrent);
		};
	}, [section, fresh, counts.runs, counts.comparisons, counts.corpus]);
	return sectionsRef;
}

export { ShellSections as default };
