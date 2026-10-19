import type { z } from "zod";

import type { CheckpointRecord } from "./checkpoint";
import type {
	ConfirmationGroupRecord,
	ConfirmationRepRecord,
	SessionConfirmationGroupRecord,
	SessionConfirmationRepRecord,
} from "./confirmation-record";
import type {
	GroupReportSummaryRecord,
	RunSummaryRecord,
} from "./record-summary";
import type { replayRecordSchema } from "./replay";
import type { SessionAttemptRecord } from "./session-record";

type ParsedReplayRecord = z.infer<typeof replayRecordSchema>;

type LegacyGroupRecord = Omit<ConfirmationGroupRecord, "caseId">;

type WrittenRecord =
	| CheckpointRecord
	| ParsedReplayRecord
	| ConfirmationGroupRecord
	| SessionConfirmationGroupRecord
	| SessionConfirmationRepRecord
	| ConfirmationRepRecord
	| LegacyGroupRecord
	| GroupReportSummaryRecord
	| RunSummaryRecord
	| SessionAttemptRecord;

export type { WrittenRecord };
