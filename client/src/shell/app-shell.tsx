import { useQuery } from "@tanstack/react-query";
import { Link, Outlet } from "@tanstack/react-router";
import { corpusQuery } from "#client/corpus/corpus-query";
import { runHistoryQuery } from "#client/run-history/run-history-query";
import { CorpusCard } from "./corpus-card";
import { useGoToShortcut } from "./use-go-to-shortcut";
import type { BadgeCounts } from "./nav-items";
import { NAV_ITEMS } from "./nav-items";
import "./app-shell.css";

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
	const badge =
		count === undefined ? null : <span className="rh-nav__badge">{count}</span>;

	if (path === undefined) {
		return (
			<li className="rh-nav__item rh-nav__item--planned">
				{icon}
				<span className="rh-nav__label">{label}</span>
				<span className="rh-visually-hidden">planned</span>
				{badge}
			</li>
		);
	}

	return (
		<li className="rh-nav__item">
			<Link to={path} className="rh-nav__link">
				{icon}
				<span className="rh-nav__label">{label}</span>
				{badge}
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
		<div className="rh-shell">
			<nav className="rh-nav" aria-label="Sections">
				<div className="rh-nav__masthead">
					<span className="rh-nav__product">Rehearse</span>
				</div>

				<CorpusCard />

				<ul className="rh-nav__list">
					{NAV_ITEMS.map(({ label, icon: NavIcon, path, badge }) => (
						<NavEntry
							key={label}
							label={label}
							icon={<NavIcon size={ICON_SIZE} aria-hidden />}
							path={path}
							count={badge === undefined ? undefined : counts[badge]}
						/>
					))}
				</ul>
			</nav>

			<main className="rh-shell__main">
				<Outlet />
			</main>
		</div>
	);
}
