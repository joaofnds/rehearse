import { relative } from "node:path";

import type { Immutable } from "#benchmark/contracts";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import type { SessionAttemptRecord } from "#benchmark/session-record";
import type { RecordId } from "#cli/record-id";
import type {
	AttemptEvidenceReport,
	SessionJudgeEvidence,
} from "#server/attempt-evidence-contract";
import readOwnedConfirmationRep from "#server/confirmation-evidence";
import { SessionHistoryReaderError } from "#server/session-history-reader";

function judgeEvidence(
	judge: Immutable<SessionAttemptRecord["judge"]>,
): SessionJudgeEvidence | undefined {
	if (judge === undefined) {
		return undefined;
	}

	const { attempts: _attempts, providerCalls: _calls, ...evidence } = judge;

	return evidence;
}

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
		kind: "session",
		record: {
			caseId: record.caseId,
			checks: record.checks,
			error: "error" in record ? record.error : undefined,
			judge: judgeEvidence(record.judge),
			outcome: record.outcome,
			reply: record.reply,
			stateGradingError:
				"stateGradingError" in record ? record.stateGradingError : undefined,
			stateResults: "stateResults" in record ? record.stateResults : undefined,
		},
		state: "available",
	};
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

export { sessionEvidence, readRepSessionEvidence };
