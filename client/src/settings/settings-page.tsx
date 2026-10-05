import { useQuery } from "@tanstack/react-query";
import { launchSettingsQuery } from "#client/launch/settings-query";
import { plural } from "#client/plural";
import { runHistoryQuery } from "#client/run-history/run-history-query";
import { ScreenHeader } from "#client/system/components/screen-header";
import { recordsSizeQuery } from "./settings-requests";

const SIZE_UNITS = [
	["GB", 1_000_000_000],
	["MB", 1_000_000],
	["kB", 1000],
] as const;

/** In decimal units rounded to whole numbers, as the design writes 612 MB. */
function sizeReading(bytes: number): string {
	const unit = SIZE_UNITS.find(([, size]) => bytes >= size);

	return unit === undefined
		? `${String(bytes)} B`
		: `${String(Math.round(bytes / unit[1]))} ${unit[0]}`;
}

function RecordsReading(): React.ReactNode {
	const settings = useQuery(launchSettingsQuery);
	const runs = useQuery(runHistoryQuery);
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
			{size.data === undefined ? null : `, ${sizeReading(size.data)}`}
			{size.isError ? ` · ${size.error.message}` : null}
		</>
	);
}

export function SettingsPage(): React.JSX.Element {
	return (
		<div>
			<ScreenHeader title="Settings" subline={<RecordsReading />} />
		</div>
	);
}
