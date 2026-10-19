import { EMPTY_COLLECTION_LENGTH } from "./history-table-contract";
import type { InvalidatedSelection } from "./invalidated-selection";
import type { RunDiscoverySearch } from "./run-discovery";
import {
	launchMatchesDiscovery,
	matchesDiscovery,
	sortDiscoveredRows,
} from "./run-discovery";
import type { RunHistoryResponse } from "./run-history-query";

function listedRecords(
	selection: InvalidatedSelection | undefined,
	records: Pick<RunHistoryResponse, "rows" | "launches">,
	discovery: RunDiscoverySearch,
): Pick<RunHistoryResponse, "rows" | "launches"> {
	if (selection !== undefined) {
		return {
			launches: [],
			rows: sortDiscoveredRows(
				(selection.kind === "listed" ? selection.rows : []).filter((row) =>
					matchesDiscovery(row, discovery),
				),
				discovery.sort,
			),
		};
	}

	return {
		launches: records.launches.filter((launch) =>
			launchMatchesDiscovery(launch, discovery),
		),
		rows: sortDiscoveredRows(
			records.rows.filter((row) => matchesDiscovery(row, discovery)),
			discovery.sort,
		),
	};
}

function saysNothingListed(
	selection: InvalidatedSelection | undefined,
	listed: Pick<RunHistoryResponse, "rows" | "launches">,
): boolean {
	const selectionSaysWhy =
		selection !== undefined &&
		(selection.kind !== "listed" ||
			selection.rows.length === EMPTY_COLLECTION_LENGTH);

	return (
		!selectionSaysWhy &&
		listed.rows.length === EMPTY_COLLECTION_LENGTH &&
		listed.launches.length === EMPTY_COLLECTION_LENGTH
	);
}

function waitsForCorpusFilter(
	pending: boolean,
	corpus: RunDiscoverySearch["corpus"],
): boolean {
	return pending && corpus !== undefined && corpus !== "all";
}

export { listedRecords, saysNothingListed, waitsForCorpusFilter };
