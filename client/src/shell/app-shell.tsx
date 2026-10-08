import { useQuery } from "@tanstack/react-query";
import { calibrationQuery } from "#client/calibration/calibration-query";
import { createLink, Outlet } from "@tanstack/react-router";
import { comparisonIndexQuery } from "#client/comparison/comparison-index-query";
import { corpusQuery } from "#client/corpus/corpus-query";
import { runListingQuery } from "#client/run-history/run-history-query";
import { useFreshInstall } from "#client/setup/fresh-install";
import { SetupPage } from "#client/setup/setup-page";
import { CorpusCard } from "./corpus-card";
import { runsInFlight } from "./run-in-flight";
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
	"aria-current": current,
	...anchor
}: NavAnchorProps): React.JSX.Element {
	return <a {...anchor} aria-current={marksCurrent ? current : undefined} />;
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
	readonly path: string | undefined;
	readonly count: number | undefined;
	readonly marksCurrent: boolean;
}): React.JSX.Element {
	if (path === undefined) {
		return (
			<li className="flex items-center gap-2.5 rounded-md border-l-2 border-transparent px-2.5 py-2 text-secondary-foreground opacity-60">
				{icon}
				<span className="flex-1">{label}</span>
				<span className="font-mono text-xs text-dim">planned</span>
			</li>
		);
	}

	return (
		<li>
			<NavLink
				to={path}
				marksCurrent={marksCurrent}
				className="flex items-center gap-2.5 rounded-md border-l-2 border-transparent px-2.5 py-2 text-secondary-foreground hover:bg-row-hover current:border-primary current:bg-selected current:text-pale"
			>
				{icon}
				<span className="flex-1">{label}</span>
				{count === undefined ? null : (
					<span className="font-mono text-xs text-dim">{count}</span>
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
	const calibration = useQuery(calibrationQuery);

	return {
		runs: runs.data?.rows.length,
		monitor:
			runs.data === undefined ? undefined : runsInFlight(runs.data.rows).length,
		corpus: corpus.data?.files.length,
		comparisons: comparisons.data?.comparisons.length,
		calibration: calibration.data?.reviews,
	};
}

export function AppShell(): React.JSX.Element {
	const counts = useBadgeCounts();
	const fresh = useFreshInstall();
	useGoToShortcut();

	return (
		<div className="flex h-screen flex-col overflow-hidden">
			{/* The screen scrolls inside main, so the corpus card and the run in flight stay in view on a page several screens tall. */}
			<div className="flex min-h-0 flex-1">
				<nav
					aria-label="Sections"
					className="flex w-68 flex-none flex-col gap-4 overflow-y-auto border-r border-divider bg-sidebar px-3 py-4"
				>
					<div className="px-2.5 pt-0.5">
						<span className="text-lg font-medium tracking-tight">Rehearse</span>
						<CorpusCard />
					</div>

					<ul className="flex flex-col gap-0.5">
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
								marksCurrent={!fresh}
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
