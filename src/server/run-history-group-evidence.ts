import type { ParsedConfirmationGroupRecord } from "#benchmark/confirmation-record";
import type { Immutable } from "#benchmark/contracts";
import { formatRecordId } from "#cli/record-id";
import {
	finalOutcomeTally,
	groupCost,
	qualityFailureCount,
	stageSummaries,
} from "#server/confirmation-group-summary";
import type {
	ConfirmationGroupRow,
	GroupRep,
	Unjudged,
} from "#server/run-history-contract";
import { groupFiredBlockers } from "#server/run-history-group-fired-blockers";
import { groupPipelineStages } from "#server/run-history-group-pipeline-stages";
import { groupReps, repLink } from "#server/run-history-group-reps";

type GroupEvidence = Pick<
	Unjudged<ConfirmationGroupRow>,
	| "links"
	| "recordId"
	| "pipelineStages"
	| "firedBlockers"
	| "cost"
	| "finalOutcomes"
	| "qualityFailures"
	| "stageSummaries"
	| "successful"
	| "unreadReps"
	| "wallTime"
>;

type GroupFigures = Pick<
	GroupEvidence,
	| "cost"
	| "finalOutcomes"
	| "qualityFailures"
	| "stageSummaries"
	| "successful"
	| "unreadReps"
	| "wallTime"
>;

function groupFigures(
	record: Immutable<ParsedConfirmationGroupRecord>,
	reps: readonly GroupRep[],
): GroupFigures {
	const recorded = reps.filter((rep) => "metrics" in rep);
	return {
		cost: groupCost(record, reps),
		finalOutcomes: finalOutcomeTally(recorded),
		qualityFailures: qualityFailureCount(recorded),
		stageSummaries: stageSummaries(
			record.mode,
			record.declaredStages,
			recorded,
		),
		successful: recorded.filter(({ outcome }) => outcome === "SUCCESSFUL")
			.length,
		unreadReps: reps.filter((rep) => "reason" in rep),
		wallTime: { ms: record.makespanMs, state: "available" },
	};
}

interface GroupEvidenceInput {
	readonly runsDirectory: string;
	readonly groupId: string;
}

async function groupEvidence(
	{ runsDirectory, groupId }: GroupEvidenceInput,
	record: Immutable<ParsedConfirmationGroupRecord>,
): Promise<GroupEvidence> {
	const links = await Promise.all(
		record.repRecords.map(
			async (reference) =>
				await repLink(runsDirectory, {
					groupId,
					mode: record.mode,
					reference,
				}),
		),
	);
	const reps = await groupReps(runsDirectory, record);
	const recordId = formatRecordId({ groupId, kind: "group" });
	const pipelineStages = await groupPipelineStages(runsDirectory, record);
	const firedBlockers = await groupFiredBlockers(runsDirectory, record);

	return {
		firedBlockers,
		links,
		pipelineStages,
		recordId,
		...groupFigures(record, reps),
	};
}

export { groupEvidence as default };
