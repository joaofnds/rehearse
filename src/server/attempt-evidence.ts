import { dirname, relative } from "node:path";
import { ZodError } from "zod";
import type { z } from "zod";
import type { Immutable } from "#benchmark/contracts";
import type { SessionAttemptRecord } from "#benchmark/session-record";
import { sessionAttemptRecordSchema } from "#benchmark/session-record";
import { replayRecordSchema } from "#benchmark/replay-record";
import { parseConfirmationGroupRecord } from "#benchmark/confirmation-record";
import { readConstructedEvidenceFile } from "./constructed-evidence-file";
import { readOwnedConfirmationRep } from "./confirmation-evidence";
import type { RecordId } from "#cli/record-id";
import type { RecordedEvidenceFile } from "./session-history-reader";
import { parseRecordId } from "#cli/record-id";
import { recordFileFor } from "#cli/show-command";
import {
	confirmationGroupPaths,
	runNameFromTimestamp,
} from "#benchmark/run-layout";
import {
	canonicalRunsRoot,
	SessionHistoryReaderError,
} from "./session-history-reader";
import { scorecardEvidenceSchema } from "./evidence-projection";
import type { SavedStageOutput, StepAssessment } from "./evidence-projection";

export interface SessionEvidence {
	readonly caseId: string;
	readonly outcome: SessionAttemptRecord["outcome"];
	readonly reply?: string | undefined;
	readonly error?: string | undefined;
	readonly checks: Immutable<SessionAttemptRecord["checks"]>;
	readonly stateResults?: Immutable<
		Extract<SessionAttemptRecord, { schemaVersion: 3 }>["stateResults"]
	>;
	readonly stateGradingError?: string | undefined;
}
export type AttemptEvidenceReport =
	| { readonly state: "unavailable"; readonly reason: string }
	| {
			readonly state: "available";
			readonly kind: "session";
			readonly record: SessionEvidence;
	  }
	| {
			readonly state: "available";
			readonly kind: "stage";
			readonly stage: string;
			readonly output: SavedStageOutput;
			readonly diff?: string | undefined;
			readonly completionReply?: string | undefined;
			readonly assessment: StepAssessment;
	  };
function sessionEvidence(
	record: Immutable<SessionAttemptRecord>,
	caseId: string,
): AttemptEvidenceReport {
	if (record.caseId !== caseId) {
		throw new SessionHistoryReaderError(
			"refused",
			"The saved session evidence names a different case.",
		);
	}
	return {
		state: "available",
		kind: "session",
		record: {
			caseId: record.caseId,
			outcome: record.outcome,
			reply: record.reply,
			error: "error" in record ? record.error : undefined,
			checks: record.checks,
			stateResults: "stateResults" in record ? record.stateResults : undefined,
			stateGradingError:
				"stateGradingError" in record ? record.stateGradingError : undefined,
		},
	};
}
type ScorecardEvidence = Extract<AttemptEvidenceReport, { kind: "stage" }>;
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

	return { state: "available", kind: "stage", ...record };
}
async function readRepSessionEvidence(
	root: string,
	id: Extract<RecordId, { kind: "rep:session" }>,
	record: Immutable<SessionAttemptRecord>,
): Promise<AttemptEvidenceReport> {
	const { rep } = await readOwnedConfirmationRep(root, id.groupId, id.repId);
	if (rep.mode !== "session" || rep.lineage.kind !== "SESSION") {
		throw new SessionHistoryReaderError(
			"refused",
			"This repetition is not a session.",
		);
	}
	const checks = rep.stages.find((item) => item.stage === "checks");
	if (
		checks === undefined ||
		!("evidence" in checks) ||
		checks.evidence?.recordFile !==
			relative(
				confirmationGroupPaths(root, id.groupId).rep(id.repId).directory,
				confirmationGroupPaths(root, id.groupId).rep(id.repId).attemptFile,
			)
	) {
		throw new SessionHistoryReaderError(
			"refused",
			"This repetition does not reference the saved session attempt.",
		);
	}
	if (record.lineage !== rep.lineage.lineage) {
		throw new SessionHistoryReaderError(
			"refused",
			"The saved session lineage differs from its repetition.",
		);
	}
	return sessionEvidence(record, rep.caseId);
}
async function readRepStageEvidence(
	root: string,
	id: Extract<RecordId, { kind: "rep:stage" }>,
	saved: RecordedEvidenceFile,
	scorecard: Immutable<z.output<typeof scorecardEvidenceSchema>>,
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
export async function readAttemptEvidence(request: {
	readonly runsDirectory: string;
	readonly id: string;
}): Promise<AttemptEvidenceReport> {
	const id = parseRecordId(request.id);
	if (
		id.kind !== "attempt:session" &&
		id.kind !== "attempt:stage" &&
		id.kind !== "rep:session" &&
		id.kind !== "rep:stage"
	) {
		throw new SessionHistoryReaderError(
			"refused",
			"This record is not a saved attempt.",
		);
	}
	const root = await canonicalRunsRoot(request.runsDirectory);
	const file = await recordFileFor(id, root);
	const saved = await readConstructedEvidenceFile(root, file);
	try {
		const document: unknown = JSON.parse(saved.text);
		switch (id.kind) {
			case "attempt:session": {
				return sessionEvidence(
					sessionAttemptRecordSchema.parse(document),
					id.caseId,
				);
			}
			case "rep:session": {
				return await readRepSessionEvidence(
					root,
					id,
					sessionAttemptRecordSchema.parse(document),
				);
			}
			case "attempt:stage": {
				const replay = replayRecordSchema.parse(document);
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
			case "rep:stage": {
				return await readRepStageEvidence(
					root,
					id,
					saved,
					scorecardEvidenceSchema.parse(document),
				);
			}
			default: {
				return id satisfies never;
			}
		}
	} catch (error) {
		if (error instanceof ZodError || error instanceof SyntaxError) {
			return {
				state: "unavailable",
				reason:
					"The saved attempt or replay retains no readable detailed output and assessment.",
			};
		}
		throw error;
	}
}

export interface GroupAttemptIndex {
	readonly groupId: string;
	readonly caseId: string;
	readonly repRecords: readonly {
		readonly repId: string;
		readonly ordinal: number;
	}[];
}
export async function readGroupAttemptIndex(request: {
	readonly runsDirectory: string;
	readonly groupId: string;
}): Promise<GroupAttemptIndex> {
	const id = parseRecordId(`group:${request.groupId}`);
	if (id.kind !== "group") {
		throw new SessionHistoryReaderError(
			"refused",
			"This is not a saved group identity.",
		);
	}
	const root = await canonicalRunsRoot(request.runsDirectory);
	const file = confirmationGroupPaths(root, id.groupId).groupFile;
	const saved = await readConstructedEvidenceFile(root, file);
	const group = parseConfirmationGroupRecord(saved.text);
	if (group.groupId !== id.groupId) {
		throw new SessionHistoryReaderError(
			"refused",
			"The saved group names a different identity.",
		);
	}
	return {
		groupId: group.groupId,
		caseId: group.caseId,
		repRecords: group.repRecords.map(({ repId, ordinal }) => ({
			repId,
			ordinal,
		})),
	};
}
