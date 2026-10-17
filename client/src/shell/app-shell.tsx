import { useQuery } from "@tanstack/react-query";
import { createLink, Outlet, useLocation } from "@tanstack/react-router";
import { comparisonIndexQuery } from "#client/comparison/comparison-index-query";
import { corpusQuery } from "#client/corpus/corpus-query";
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

const ICON_SIZE = 15;

type NavAnchorProps = React.ComponentPropsWithRef<"a"> & {
	readonly marksCurrent: boolean;
};

/**
 * The router marks the link to the address bar's route as the current page,
 * which is false while setup stands in for every screen.
 */
function NavAnchor({
	marksCurrent,
	"aria-current": _current,
	...anchor
}: NavAnchorProps): React.JSX.Element {
	return <a {...anchor} aria-current={marksCurrent ? "page" : undefined} />;
}

const NavLink = createLink(NavAnchor);

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
			<NavLink
				to={path}
				search={path === "/" ? runsReturnSearch : {}}
				marksCurrent={marksCurrent}
				className="flex items-center gap-2.5 rounded-md border-l-2 border-transparent px-2.5 py-2 text-secondary-foreground no-underline hover:bg-row-hover hover:no-underline current:border-primary current:bg-selected current:text-pale"
			>
				{icon}
				<span className="flex-1">{label}</span>
				{count === undefined ? null : (
					<span className="font-mono text-12 text-dim">{count}</span>
				)}
			</NavLink>
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
function useBadgeCounts(): BadgeCounts {
	const runs = useQuery(runListingQuery);
	const corpus = useQuery(corpusQuery);
	const comparisons = useQuery(comparisonIndexQuery);

	return {
		runs: runs.data === undefined ? undefined : listedEntryCount(runs.data),
		corpus: corpus.data?.files.length,
		comparisons: comparisons.data?.comparisons.length,
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
	useGoToShortcut();

	return (
		<div className="flex h-screen flex-col overflow-hidden">
			{/* The screen scrolls inside main, so the corpus card and the run in flight stay in view on a page several screens tall. */}
			<div className="flex min-h-0 flex-1 flex-col md:flex-row">
				<nav
					aria-label="Sections"
					className="flex w-full flex-none flex-col gap-2 overflow-y-auto border-b border-divider bg-sidebar px-3 py-3 md:w-68 md:gap-4 md:border-r md:border-b-0 md:py-4"
				>
					<div className="px-2.5 pt-0.5">
						<span className="text-17 font-semibold tracking-tight">
							Rehearse
						</span>
						<CorpusCard />
					</div>

					<GlobalSearch />

					<ul className="flex flex-row gap-0.5 overflow-x-auto md:flex-col">
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
				</nav>

				<main className="min-w-0 flex-1 overflow-y-auto">
					{fresh ? <SetupPage /> : <Outlet />}
				</main>
			</div>
			<RunInFlightBar />
		</div>
	);
}
