import { hasConfirmationSummary } from "#benchmark/confirmation-archive";
import { parseConfirmationGroupRecord } from "#benchmark/confirmation-record";
import type { ParsedConfirmationGroupRecord } from "#benchmark/confirmation-record";
import type { Immutable } from "#benchmark/contracts";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import type {
	ConfirmationGroupRow,
	GroupRowIdentity,
	Unjudged,
} from "#server/run-history-contract";
import groupEvidence from "#server/run-history-group-evidence";
import { repAttempts } from "#server/run-history-group-reps";
import sessionGroupSavedState from "#server/run-history-group-saved-state";
import type { ListingIndexes } from "#server/run-history-listing-contract";
import leftOutWithoutSummary from "#server/run-history-unsummarized-group";
import type { ListedGroup } from "#server/run-history-unsummarized-group";

type GroupRowIndexes = Pick<ListingIndexes, "attempts" | "launchByPid">;

async function groupRow(
	runsDirectory: string,
	{ groupId, shortId, checkpoint }: GroupRowIdentity,
	{ attempts, launchByPid }: GroupRowIndexes,
): Promise<Unjudged<ConfirmationGroupRow> | undefined> {
	const record = await groupRecord({ groupId, launchByPid, runsDirectory });
	if (record === undefined) {
		return undefined;
	}

	const evidence = await groupEvidence({ groupId, runsDirectory }, record);

	const row: Unjudged<ConfirmationGroupRow> = {
		caseId: record.caseId,
		checkpoint,
		corpusVersion: record.inputs.corpusVersion,
		cost: evidence.cost,
		finalOutcomes: evidence.finalOutcomes,
		firedBlockers: evidence.firedBlockers,
		groupId,
		kind: "group",
		links: evidence.links,
		mode: record.mode,
		pipelineStages: evidence.pipelineStages,
		qualityFailures: evidence.qualityFailures,
		recordId: evidence.recordId,
		repAttempts: repAttempts(record, attempts),
		reps: record.reps,
		shortId,
		stageSummaries: evidence.stageSummaries,
		startedAt: record.startedAt,
		successful: evidence.successful,
		unreadReps: evidence.unreadReps,
		wallTime: evidence.wallTime,
	};
	if (record.mode === "session") {
		return {
			...row,
			savedState: await sessionGroupSavedState(runsDirectory, record),
		};
	}

	return row;
}

class IncompleteConfirmationError extends Error {
	public override name = "IncompleteConfirmationError";
	public constructor(public readonly groupId: string) {
		super("incomplete: no group.json recorded");
	}
}

async function groupRecord(
	group: ListedGroup,
): Promise<Immutable<ParsedConfirmationGroupRecord> | undefined> {
	const { runsDirectory, groupId } = group;
	if (!(await hasConfirmationSummary({ groupId, runsDirectory }))) {
		if (await leftOutWithoutSummary(group)) {
			return undefined;
		}

		throw new IncompleteConfirmationError(groupId);
	}

	const { groupFile } = confirmationGroupPaths(runsDirectory, groupId);

	return parseConfirmationGroupRecord(await Bun.file(groupFile).text());
}

export { groupRow, groupRecord, IncompleteConfirmationError };
