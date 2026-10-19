import type { Immutable } from "#benchmark/contracts";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ArchiveReport } from "#client/run-history/confirmation-archives";
import { useConfirmationArchives } from "#client/run-history/confirmation-archives";
import type { SettingsReading } from "#client/launch/settings-query";
import { launchSettingsQuery } from "#client/launch/settings-query";
import type { RunListingResponse } from "#client/run-history/run-history-query";
import { runListingQuery } from "#client/run-history/run-history-query";

/**
 * A records directory with no stored spend ceiling and no record at all.
 * Records can predate the ceiling, so a missing ceiling alone is not enough,
 * and an unread reading is not fresh, since nothing vouches for it.
 */
export function isFreshInstall(
	settings: SettingsReading | undefined,
	records: RunListingResponse | undefined,
	archives: Immutable<ArchiveReport> | undefined,
): boolean {
	if (
		settings === undefined ||
		records === undefined ||
		archives === undefined
	) {
		return false;
	}

	return (
		settings.spendCeilingUsd === null &&
		records.rows.length === 0 &&
		records.launches.length === 0 &&
		records.unreadable.length === 0 &&
		archives.archived.length === 0 &&
		archives.unreadable.length === 0
	);
}

export function useFreshInstall(): boolean {
	const settings = useQuery(launchSettingsQuery);
	const records = useQuery(runListingQuery);
	const archives = useConfirmationArchives();
	const hasRecords =
		(records.data?.rows.length ?? 0) > 0 ||
		(records.data?.launches.length ?? 0) > 0 ||
		(records.data?.unreadable.length ?? 0) > 0 ||
		(archives.data?.archived.length ?? 0) > 0 ||
		(archives.data?.unreadable.length ?? 0) > 0;
	const [seenRecords, setSeenRecords] = useState(false);
	useEffect(() => {
		if (hasRecords) {
			setSeenRecords(true);
		}
	}, [hasRecords]);

	// Hiding a record cannot turn a shell that already saw it into a first install.
	return (
		!seenRecords && isFreshInstall(settings.data, records.data, archives.data)
	);
}
