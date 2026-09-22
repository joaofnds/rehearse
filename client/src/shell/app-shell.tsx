import { useQuery } from "@tanstack/react-query";
import { Link, Outlet } from "@tanstack/react-router";
import { corpusQuery } from "#client/corpus/corpus-query";
import { runHistoryQuery } from "#client/run-history/run-history-query";
import { CorpusCard } from "./corpus-card";
import { useGoToShortcut } from "./use-go-to-shortcut";
import type { BadgeCounts } from "./nav-items";
import { NAV_ITEMS } from "./nav-items";

const ICON_SIZE = 15;

function NavEntry({
	label,
	icon,
	path,
	count,
}: {
	readonly label: string;
	readonly icon: React.ReactNode;
	readonly path: string | undefined;
	readonly count: number | undefined;
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
			<Link
				to={path}
				className="flex items-center gap-2.5 rounded-md border-l-2 px-2.5 py-2"
				activeProps={{ className: "border-primary bg-selected text-pale" }}
				inactiveProps={{
					className:
						"border-transparent text-secondary-foreground hover:bg-subtle",
				}}
			>
				{icon}
				<span className="flex-1">{label}</span>
				{count === undefined ? null : (
					<span className="font-mono text-xs text-dim">{count}</span>
				)}
			</Link>
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
	const runs = useQuery(runHistoryQuery);
	const corpus = useQuery(corpusQuery);

	return {
		runs: runs.data?.rows.length,
		corpus: corpus.data?.files.length,
	};
}

export function AppShell(): React.JSX.Element {
	const counts = useBadgeCounts();
	useGoToShortcut();

	return (
		<div className="flex min-h-screen">
			{/* Sticky, because the corpus card must stay in view on a page several screens tall. */}
			<nav
				aria-label="Sections"
				className="sticky top-0 flex h-screen w-68 flex-none flex-col gap-4 overflow-y-auto border-r border-divider bg-sidebar px-3 py-4"
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
						/>
					))}
				</ul>
			</nav>

			<main className="min-w-0 flex-1">
				<Outlet />
			</main>
		</div>
	);
}
