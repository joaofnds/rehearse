import { parseConfirmationGroupRecord } from "#benchmark/confirmation-record";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import { parseRecordId } from "#cli/record-id";
import type { GroupAttemptIndex } from "#server/attempt-evidence-contract";
import readConstructedEvidenceFile from "#server/constructed-evidence-file";
import {
	SessionHistoryReaderError,
	canonicalRunsRoot,
} from "#server/session-history-reader";

interface GroupAttemptIndexRequest {
	readonly runsDirectory: string;
	readonly groupId: string;
}

async function readGroupAttemptIndex(
	request: GroupAttemptIndexRequest,
): Promise<GroupAttemptIndex> {
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
		caseId: group.caseId,
		groupId: group.groupId,
		repRecords: group.repRecords.map(({ repId, ordinal }) => ({
			ordinal,
			repId,
		})),
	};
}

export { readGroupAttemptIndex as default };
