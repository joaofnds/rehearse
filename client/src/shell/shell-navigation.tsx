import CorpusCard from "./corpus-card";
import GlobalSearch from "./global-search";
import type { ShellCounts } from "./shell-counts";
import ShellSections from "./shell-sections";

interface ShellNavigationProps {
	readonly counts: ShellCounts;
	readonly fresh: boolean;
}

function ShellNavigation({
	counts,
	fresh,
}: ShellNavigationProps): React.JSX.Element {
	return (
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

			<ShellSections counts={counts} fresh={fresh} />
			<div className="md:mt-auto">
				<CorpusCard enabled={counts.metadataReady} />
			</div>
		</nav>
	);
}

export { ShellNavigation as default };
