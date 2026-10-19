import { dirname, relative } from "node:path";

import type { z } from "zod";

import type { Immutable } from "#benchmark/contracts";
import type { replayRecordSchema } from "#benchmark/replay-record";
import {
	confirmationGroupPaths,
	runNameFromTimestamp,
} from "#benchmark/run-layout";
import type { RecordId } from "#cli/record-id";
import type {
	AttemptEvidenceReport,
	RepStageEvidence,
	ScorecardEvidence,
} from "#server/attempt-evidence-contract";
import readOwnedConfirmationRep from "#server/confirmation-evidence";
import { scorecardEvidenceSchema } from "#server/evidence-projection";
import { SessionHistoryReaderError } from "#server/session-history-reader";

function stageEvidence(
	record: Immutable<z.output<typeof scorecardEvidenceSchema>>,
	stage: string,
): ScorecardEvidence {
	if (record.stage !== stage) {
		throw new SessionHistoryReaderError(
			"refused",
			"The saved scorecard does not identify the requested step.",
		);
	}

	return { kind: "stage", state: "available", ...record };
}

async function readRepStageEvidence(
	root: string,
	id: Extract<RecordId, { kind: "rep:stage" }>,
	{ saved, scorecard }: RepStageEvidence,
): Promise<AttemptEvidenceReport> {
	const { group, rep } = await readOwnedConfirmationRep(
		root,
		id.groupId,
		id.repId,
	);
	const outcome = rep.stages.find((item) => item.stage === id.stage);
	if (
		rep.mode === "session" ||
		!group.declaredStages.some((declared) => declared === id.stage) ||
		outcome?.status !== "JUDGED" ||
		outcome.evidence.recordFile !==
			relative(
				dirname(
					confirmationGroupPaths(root, id.groupId).rep(id.repId).recordFile,
				),
				saved.path,
			)
	) {
		throw new SessionHistoryReaderError(
			"refused",
			"This repetition does not own a judged scorecard for the requested step.",
		);
	}

	const evidence = stageEvidence(scorecard, id.stage);
	if (
		evidence.assessment.grade !== outcome.grade ||
		evidence.assessment.verdict !== outcome.verdict
	) {
		throw new SessionHistoryReaderError(
			"refused",
			"The saved scorecard differs from its repetition outcome.",
		);
	}

	return evidence;
}

interface ReplayEvidenceInput {
	readonly id: Extract<RecordId, { readonly kind: "attempt:stage" }>;
	readonly replay: Immutable<z.output<typeof replayRecordSchema>>;
}

function replayEvidence({
	id,
	replay,
}: ReplayEvidenceInput): ScorecardEvidence {
	if (
		replay.consumed.lineage !== id.lineage ||
		runNameFromTimestamp(replay.timestamp) !== id.timestamp
	) {
		throw new SessionHistoryReaderError(
			"refused",
			"The saved replay names a different lineage or timestamp.",
		);
	}

	return stageEvidence(
		scorecardEvidenceSchema.parse(replay.scorecard),
		replay.stage,
	);
}

export { stageEvidence, readRepStageEvidence, replayEvidence };
