import { Outlet } from "@tanstack/react-router";

import { useFreshInstall } from "#client/setup/fresh-install";
import SetupPage from "#client/setup/setup-page";

import { RunInFlightBar } from "./run-in-flight-bar";
import useBadgeCounts from "./shell-counts";
import ShellNavigation from "./shell-navigation";
import { useGoToShortcut } from "./use-go-to-shortcut";

function AppShell(): React.JSX.Element {
	const counts = useBadgeCounts();
	const fresh = useFreshInstall();

	useGoToShortcut();

	return (
		<div className="relative flex h-dvh max-h-full flex-col overflow-clip">
			{/* The screen scrolls inside main, so the corpus card and the run in flight stay in view on a page several screens tall. */}
			<div className="flex min-h-0 flex-1 flex-col md:flex-row">
				<ShellNavigation counts={counts} fresh={fresh} />

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

export { AppShell as default };
