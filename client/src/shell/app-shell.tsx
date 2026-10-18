import { useEffect, useRef } from "react";
import { CurrentLink } from "#client/system/components/current-link";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useLocation } from "@tanstack/react-router";
import { comparisonIndexQuery } from "#client/comparison/comparison-index-query";
import { corpusSummaryQuery } from "#client/corpus/corpus-query";
import {
	listedEntryCount,
	runListingQuery,
} from "#client/run-history/run-history-query";
import { useRunsReturnSearch } from "#client/run-history/run-discovery";
import { useFreshInstall } from "#client/setup/fresh-install";
import { SetupPage } from "#client/setup/setup-page";
import { GlobalSearch } from "./global-search";
import { CorpusCard } from "./corpus-card";
import { RunInFlightBar } from "./run-in-flight-bar";
import { useGoToShortcut } from "./use-go-to-shortcut";
import type { BadgeCounts } from "./nav-items";
import { NAV_ITEMS } from "./nav-items";

const ICON_SIZE = 16;

function NavEntry({
	label,
	icon,
	path,
	count,
	marksCurrent,
}: {
	readonly label: string;
	readonly icon: React.ReactNode;
	readonly path: string;
	readonly count: number | undefined;
	readonly marksCurrent: boolean;
}): React.JSX.Element {
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

/**
 * Each badge counts the whole collection its route serves, not the rows a
 * screen's own filter is showing, which is the design's own answer: its filter
 * bar reads "All 148" beside a nav badge of 148 (SPEC.md:107-109). A count is
 * undefined until its collection loads, so an unloaded badge renders nothing
 * rather than a zero it cannot vouch for.
 */
interface ShellCounts extends BadgeCounts {
	readonly metadataReady: boolean;
}

function useBadgeCounts(): ShellCounts {
	const runs = useQuery(runListingQuery);
	const metadataReady = !runs.isPending;
	const corpus = useQuery({ ...corpusSummaryQuery, enabled: metadataReady });
	const comparisons = useQuery({
		...comparisonIndexQuery,
		enabled: metadataReady,
	});

	return {
		runs: runs.data === undefined ? undefined : listedEntryCount(runs.data),
		corpus: corpus.data?.files.length,
		comparisons: comparisons.data?.comparisons.length,
		metadataReady,
	};
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

export function AppShell(): React.JSX.Element {
	const counts = useBadgeCounts();
	const fresh = useFreshInstall();
	const pathname = useLocation({ select: (location) => location.pathname });
	const section = sectionFor(pathname);
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
	useGoToShortcut();

	return (
		<div className="relative flex h-dvh max-h-full flex-col overflow-clip">
			{/* The screen scrolls inside main, so the corpus card and the run in flight stay in view on a page several screens tall. */}
			<div className="flex min-h-0 flex-1 flex-col md:flex-row">
				<nav
					aria-label="Sections"
					className="relative flex min-h-0 w-full flex-none flex-col gap-2 overflow-y-auto overscroll-y-contain border-b border-divider bg-sidebar p-3 md:w-72 md:gap-5 md:border-r md:border-b-0 md:p-5"
				>
					<div className="flex flex-wrap items-center gap-4 md:flex-col md:items-stretch md:gap-5">
						<span className="mr-auto text-17 font-semibold tracking-tight md:px-3 md:pt-2">
							Rehearse
						</span>
						<div className="grid">
							<GlobalSearch />
						</div>
					</div>

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
					<div className="md:mt-auto">
						<CorpusCard enabled={counts.metadataReady} />
					</div>
				</nav>

				<main
					data-scroll-restoration-id="workspace"
					className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain"
				>
					{fresh ? <SetupPage /> : <Outlet />}
				</main>
			</div>
			<RunInFlightBar />
		</div>
	);
}
