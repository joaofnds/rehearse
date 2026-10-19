import { useQuery } from "@tanstack/react-query";

import { launchSettingsQuery } from "#client/launch/settings-query";
import plural from "#client/plural";
import { runListingQuery } from "#client/run-history/run-history-query";

import { recordsSizeQuery } from "./settings-requests";

const DECIMAL_UNIT_RATIO = 1000;

const SIZE_UNITS = [
	{ bytes: 1_000_000_000, symbol: "GB" },
	{ bytes: 1_000_000, symbol: "MB" },
	{ bytes: 1000, symbol: "kB" },
] as const;

/**
 * In decimal units rounded to whole numbers, as the design writes 612 MB.
 * A unit is used from the amount that would round to 1000 of the one below,
 * so 999,600 bytes is 1 MB rather than 1000 kB.
 */
function sizeReading(bytes: number): string {
	const unit = SIZE_UNITS.find(
		({ bytes: size }) =>
			Math.round((bytes * DECIMAL_UNIT_RATIO) / size) >= DECIMAL_UNIT_RATIO,
	);

	return unit === undefined
		? `${String(bytes)} B`
		: `${String(Math.round(bytes / unit.bytes))} ${unit.symbol}`;
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

export { RecordsReading as default };
