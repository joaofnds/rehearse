import { useQuery } from "@tanstack/react-query";
import { launchSettingsQuery } from "#client/launch/settings-query";
import { plural } from "#client/plural";
import { runListingQuery } from "#client/run-history/run-history-query";
import { ScreenHeader } from "#client/system/components/screen-header";
import { CorpusSettingsCard } from "./corpus-settings-card";
import { KeyboardCard } from "./keyboard-card";
import { recordsSizeQuery } from "./settings-requests";
import { SpendLimitCard } from "./spend-limit-card";

const SIZE_UNITS = [
	["GB", 1_000_000_000],
	["MB", 1_000_000],
	["kB", 1000],
] as const;

/**
 * In decimal units rounded to whole numbers, as the design writes 612 MB.
 * A unit is used from the amount that would round to 1000 of the one below,
 * so 999,600 bytes is 1 MB rather than 1000 kB.
 */
function sizeReading(bytes: number): string {
	const unit = SIZE_UNITS.find(
		([, size]) => Math.round((bytes * 1000) / size) >= 1000,
	);

	return unit === undefined
		? `${String(bytes)} B`
		: `${String(Math.round(bytes / unit[1]))} ${unit[0]}`;
}

function RecordsReading(): React.ReactNode {
	const settings = useQuery(launchSettingsQuery);
	const runs = useQuery(runListingQuery);
	const size = useQuery(recordsSizeQuery);
	if (settings.isError) {
		return `Could not read the settings: ${settings.error.message}`;
	}

	if (settings.data === undefined) {
		return undefined;
	}

	return (
		<>
			{"Local install · records at "}
			<span className="font-mono">{settings.data.recordsDirectory}</span>
			{runs.data === undefined
				? null
				: ` · ${plural(runs.data.rows.length, "record")}`}
			{runs.isError ? " · records not counted" : null}
			{size.data === undefined
				? null
				: `${runs.data === undefined ? " · " : ", "}${sizeReading(size.data)}`}
			{size.isError ? ` · ${size.error.message}` : null}
		</>
	);
}

export function SettingsPage(): React.JSX.Element {
	return (
		<div>
			<ScreenHeader title="Settings" subline={<RecordsReading />} />
			<div className="px-6 pt-4 pb-12">
				<div className="flex max-w-196 flex-col gap-3">
					<SpendLimitCard />
					<CorpusSettingsCard />
					<KeyboardCard />
				</div>
			</div>
		</div>
	);
}
