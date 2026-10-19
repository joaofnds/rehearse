import CalibrationPage from "#client/calibration/calibration-page";
import { CorpusReturnLink } from "#client/corpus/corpus-return";
import CurrentLink from "#client/system/components/current-link";
import ScreenHeader from "#client/system/components/screen-header";

import CorpusSettingsCard from "./corpus-settings-card";
import KeyboardCard from "./keyboard-card";
import RecordsReading from "./settings-record-reading";
import SpendLimitCard from "./spend-limit-card";

interface SettingsPageProps {
	readonly view?: "general" | "judges";
}

function SettingsPage({
	view = "general",
}: SettingsPageProps): React.JSX.Element {
	return (
		<div>
			<ScreenHeader
				title="Settings"
				subline={<RecordsReading />}
				aside={<CorpusReturnLink />}
			/>
			<nav
				aria-label="Settings sections"
				className="flex gap-1 border-b border-divider page-gutter"
			>
				<CurrentLink
					to="/settings"
					marksCurrent={view === "general"}
					className="inline-flex min-h-touch-target items-center rounded-t-md border-b-2 border-transparent px-4 py-2.5 text-14 text-link no-underline current:border-primary current:bg-selected current:text-pale hover:text-link-hover"
				>
					General
				</CurrentLink>
				<CurrentLink
					to="/settings"
					search={{ view: "judges" }}
					marksCurrent={view === "judges"}
					className="inline-flex min-h-touch-target items-center rounded-t-md border-b-2 border-transparent px-4 py-2.5 text-14 text-link no-underline current:border-primary current:bg-selected current:text-pale hover:text-link-hover"
				>
					Judges
				</CurrentLink>
			</nav>
			{view === "judges" ? (
				<CalibrationPage embedded />
			) : (
				<div className="page-gutter pt-8 pb-12">
					<div className="flex max-w-264.5 flex-col gap-6">
						<SpendLimitCard />
						<CorpusSettingsCard />
						<KeyboardCard />
					</div>
				</div>
			)}
		</div>
	);
}

export { SettingsPage as default };
