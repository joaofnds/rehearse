import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import type { Immutable } from "#benchmark/contracts";
import type { SettingsReading } from "#client/launch/settings-query";
import { launchSettingsQuery } from "#client/launch/settings-query";
import type { ArchiveReport } from "#client/run-history/confirmation-archives";
import { useConfirmationArchives } from "#client/run-history/confirmation-archives";
import type { RunListingResponse } from "#client/run-history/run-history-query";
import { runListingQuery } from "#client/run-history/run-history-query";

const EMPTY_COLLECTION_LENGTH = 0;

/**
 * A records directory with no stored spend ceiling and no record at all.
 * Records can predate the ceiling, so a missing ceiling alone is not enough,
 * and an unread reading is not fresh, since nothing vouches for it.
 */
function isFreshInstall(
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
		records.rows.length === EMPTY_COLLECTION_LENGTH &&
		records.launches.length === EMPTY_COLLECTION_LENGTH &&
		records.unreadable.length === EMPTY_COLLECTION_LENGTH &&
		archives.archived.length === EMPTY_COLLECTION_LENGTH &&
		archives.unreadable.length === EMPTY_COLLECTION_LENGTH
	);
}

function useFreshInstall(): boolean {
	const settings = useQuery(launchSettingsQuery);
	const records = useQuery(runListingQuery);
	const archives = useConfirmationArchives();
	const hasRecords =
		(records.data?.rows.length ?? EMPTY_COLLECTION_LENGTH) >
			EMPTY_COLLECTION_LENGTH ||
		(records.data?.launches.length ?? EMPTY_COLLECTION_LENGTH) >
			EMPTY_COLLECTION_LENGTH ||
		(records.data?.unreadable.length ?? EMPTY_COLLECTION_LENGTH) >
			EMPTY_COLLECTION_LENGTH ||
		(archives.data?.archived.length ?? EMPTY_COLLECTION_LENGTH) >
			EMPTY_COLLECTION_LENGTH ||
		(archives.data?.unreadable.length ?? EMPTY_COLLECTION_LENGTH) >
			EMPTY_COLLECTION_LENGTH;
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

export { isFreshInstall, useFreshInstall };
