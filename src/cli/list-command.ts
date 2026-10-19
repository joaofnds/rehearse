import { unhandled } from "#benchmark/contracts";
import { UsageError } from "#cli/command-usage";
import type { CommandOutput } from "#cli/output";
import { writeUnreadable } from "#cli/output";

import listAttempts from "./list-attempt-records";
import { listCheckpoints } from "./list-checkpoint-records";
import listComparisons from "./list-comparison-records";
import { listArchivedGroups, listGroups } from "./list-confirmation-records";
import listDeclaredCases from "./list-declared-cases";
import listRuns from "./list-run-records";
import type { RecordListing } from "./record-listing";

const LIST_KINDS = [
	"cases",
	"runs",
	"checkpoints",
	"attempts",
	"groups",
	"archived-groups",
	"comparisons",
] as const;

type ListKind = (typeof LIST_KINDS)[number];

function parseListKind(kind: string | undefined): ListKind {
	const found = LIST_KINDS.find((candidate) => candidate === kind);
	if (found === undefined) {
		throw new UsageError(
			`List kind ${kind ?? "(none)"} is not one of ${LIST_KINDS.join(", ")}`,
		);
	}

	return found;
}

async function listRecords(
	kind: ListKind,
	runsDirectory: string,
): Promise<RecordListing> {
	switch (kind) {
		case "cases": {
			return await listDeclaredCases();
		}
		case "runs": {
			return await listRuns(runsDirectory);
		}
		case "checkpoints": {
			return await listCheckpoints(runsDirectory);
		}
		case "attempts": {
			return await listAttempts(runsDirectory);
		}
		case "groups": {
			return await listGroups(runsDirectory);
		}
		case "archived-groups": {
			return await listArchivedGroups(runsDirectory);
		}
		case "comparisons": {
			return await listComparisons(runsDirectory);
		}
		default: {
			return unhandled(kind, "list kind");
		}
	}
}

interface ListRequest {
	readonly kind: string | undefined;
	readonly runsDirectory: string;
}

async function runList(
	request: ListRequest,
	output: CommandOutput,
): Promise<void> {
	const listing = await listRecords(
		parseListKind(request.kind),
		request.runsDirectory,
	);

	writeUnreadable(output, listing.unreadable);
	for (const { id, fields } of listing.entries) {
		output.stdout(`${[id, ...fields].join("\t")}\n`);
	}
}

export { recordedCheckpoints } from "./list-checkpoint-records";

export type { ListedRecord, RecordListing } from "./record-listing";

export type { RunCheckpoint } from "./list-checkpoint-records";

export { LIST_KINDS, listRecords, runList };

export type { ListKind, ListRequest };
