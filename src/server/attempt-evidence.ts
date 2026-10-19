import { ZodError } from "zod";

import { replayRecordSchema } from "#benchmark/replay-record";
import { sessionAttemptRecordSchema } from "#benchmark/session-record";
import { parseRecordId } from "#cli/record-id";
import type {
	AttemptEvidenceIdentity,
	AttemptEvidenceReport,
} from "#server/attempt-evidence-contract";
import savedAttemptFile from "#server/attempt-evidence-file";
import {
	readRepSessionEvidence,
	sessionEvidence,
} from "#server/attempt-session-evidence";
import {
	readRepStageEvidence,
	replayEvidence,
} from "#server/attempt-stage-evidence";
import { scorecardEvidenceSchema } from "#server/evidence-projection";
import { SessionHistoryReaderError } from "#server/session-history-reader";

interface AttemptEvidenceRequest {
	readonly runsDirectory: string;
	readonly id: string;
}

async function readAttemptEvidence(
	request: AttemptEvidenceRequest,
): Promise<AttemptEvidenceReport> {
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

	const { root, saved } = await savedAttemptFile(request.runsDirectory, id);
	return await readableDetailedEvidence(async () => {
		switch (id.kind) {
			case "attempt:session": {
				return savedSessionEvidence(saved.text, id.caseId);
			}
			case "rep:session": {
				return await readRepSessionEvidence(
					root,
					id,
					parseSessionRecord(saved.text),
				);
			}
			case "attempt:stage": {
				return savedReplayEvidence(saved.text, id);
			}
			case "rep:stage": {
				return await readRepStageEvidence(root, id, {
					saved,
					scorecard: parseScorecard(saved.text),
				});
			}
			default: {
				return id satisfies never;
			}
		}
	});
}

function savedSessionEvidence(
	text: string,
	caseId: string,
): AttemptEvidenceReport {
	return sessionEvidence(parseSessionRecord(text), caseId);
}

function savedReplayEvidence(
	text: string,
	id: Extract<AttemptEvidenceIdentity, { kind: "attempt:stage" }>,
): AttemptEvidenceReport {
	return replayEvidence({
		id,
		replay: replayRecordSchema.parse(JSON.parse(text)),
	});
}

function parseSessionRecord(
	text: string,
): ReturnType<typeof sessionAttemptRecordSchema.parse> {
	return sessionAttemptRecordSchema.parse(JSON.parse(text));
}

function parseScorecard(
	text: string,
): ReturnType<typeof scorecardEvidenceSchema.parse> {
	return scorecardEvidenceSchema.parse(JSON.parse(text));
}

async function readableDetailedEvidence(
	read: () => Promise<AttemptEvidenceReport>,
): Promise<AttemptEvidenceReport> {
	try {
		return await read();
	} catch (error) {
		if (error instanceof ZodError || error instanceof SyntaxError) {
			return {
				reason:
					"The saved attempt or replay retains no readable detailed output and assessment.",
				state: "unavailable",
			};
		}

		throw error;
	}
}

export { readAttemptEvidence };
export type {
	SessionEvidence,
	AttemptEvidenceReport,
	GroupAttemptIndex,
} from "#server/attempt-evidence-contract";
export { default as readGroupAttemptIndex } from "#server/confirmation-attempt-index";
