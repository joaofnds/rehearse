import {
	parseConfirmationGroupRecord,
	parseConfirmationRepRecord,
} from "#benchmark/confirmation-record";
import { unhandled } from "#benchmark/contracts";
import { readReplayRecord } from "#benchmark/replay";
import {
	benchmarkRunPaths,
	checkpointRecorded,
	confirmationGroupPaths,
	replayRecordFile,
} from "#benchmark/run-layout";
import { formatRecordId } from "#cli/record-id";
import type {
	Lookup,
	OriginalAttempt,
	RecordedAttempt,
	StageAttempt,
} from "#server/stage-attempts-contract";

import type { CheckpointAttempt } from "./checkpoint-attempts";

function claimedId(lookup: Lookup, recordId: string): string {
	return lookup.shortIds.get(recordId) ?? recordId;
}

/**
 * A stage that saved a checkpoint is judged there. One that stopped the run
 * saved none, and its judgment stands under the run's own id.
 */
async function originalAttempt(lookup: Lookup): Promise<OriginalAttempt> {
	const { runsDirectory, run, stage, staleness } = lookup;
	const checkpoint = formatRecordId({ kind: "checkpoint", run, stage });

	return {
		href: `/runs/${encodeURIComponent(run)}?view=results&step=${encodeURIComponent(stage)}`,
		id: claimedId(lookup, formatRecordId({ kind: "run", run })),
		kind: "original",
		staleness: (await checkpointRecorded(
			benchmarkRunPaths(runsDirectory, run),
			stage,
		))
			? staleness.of(checkpoint)
			: staleness.ofRun(run, checkpoint),
	};
}

async function replayAttempt(
	lookup: Lookup,
	lineage: string,
	timestamp: string,
): Promise<RecordedAttempt> {
	const record = await readReplayRecord(
		replayRecordFile(lookup.runsDirectory, lineage, timestamp),
	);
	const recordId = formatRecordId({
		kind: "attempt:stage",
		lineage,
		timestamp,
	});

	return {
		corpusVersion: record.corpusVersion,
		grade: record.scorecard.grade.grade,
		href: `/replays/${encodeURIComponent(lineage)}/${encodeURIComponent(timestamp)}`,
		id: claimedId(lookup, recordId),
		kind: "replay",
		staleness: lookup.staleness.of(recordId),
	};
}

/**
 * A rep is named by its group and its place in it, and is judged as part of
 * its group, so its corpus and staleness are the group's.
 */
async function repAttempt(
	lookup: Lookup,
	attempt: Extract<CheckpointAttempt, { readonly kind: "rep" }>,
): Promise<RecordedAttempt> {
	const { groupId, repId, ordinal } = attempt;
	const groupRecordId = formatRecordId({ groupId, kind: "group" });
	const paths = confirmationGroupPaths(lookup.runsDirectory, groupId);
	const group = parseConfirmationGroupRecord(
		await Bun.file(paths.groupFile).text(),
	);
	const rep = parseConfirmationRepRecord(
		await Bun.file(paths.rep(repId).recordFile).text(),
	);
	const judged = rep.stages.find(({ stage }) => stage === lookup.stage);

	return {
		corpusVersion: group.inputs.corpusVersion,
		grade: judged?.status === "JUDGED" ? judged.grade : undefined,
		href: `/groups/${encodeURIComponent(groupId)}/reps/${encodeURIComponent(repId)}/attempt`,
		id: `${claimedId(lookup, groupRecordId)} rep ${String(ordinal)}`,
		kind: "rep",
		staleness: lookup.staleness.of(groupRecordId),
	};
}

async function attemptOf(
	lookup: Lookup,
	attempt: CheckpointAttempt,
): Promise<StageAttempt> {
	switch (attempt.kind) {
		case "original": {
			return await originalAttempt(lookup);
		}
		case "replay": {
			return await replayAttempt(lookup, attempt.lineage, attempt.timestamp);
		}
		case "rep": {
			return await repAttempt(lookup, attempt);
		}
		default: {
			const result = unhandled(attempt, "checkpoint attempt");
			return result;
		}
	}
}

export { attemptOf as default };
