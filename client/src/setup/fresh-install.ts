import { useQuery } from "@tanstack/react-query";
import type { SettingsReading } from "#client/launch/settings-query";
import { launchSettingsQuery } from "#client/launch/settings-query";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { runHistoryQuery } from "#client/run-history/run-history-query";

/**
 * A records directory with no stored spend ceiling and no record at all.
 * Records can predate the ceiling, so a missing ceiling alone is not enough,
 * and an unread reading is not fresh, since nothing vouches for it.
 */
export function isFreshInstall(
	settings: SettingsReading | undefined,
	records: RunHistoryResponse | undefined,
): boolean {
	if (settings === undefined || records === undefined) {
		return false;
	}

	return (
		settings.spendCeilingUsd === null &&
		records.rows.length === 0 &&
		records.launches.length === 0 &&
		records.unreadable.length === 0
	);
}

export function useFreshInstall(): boolean {
	const settings = useQuery(launchSettingsQuery);
	const records = useQuery(runHistoryQuery);

	return isFreshInstall(settings.data, records.data);
}
