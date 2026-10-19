import { join } from "node:path";

import type { ConfirmationGroupOutcome } from "./confirmation-evidence";
import {
	parseConfirmationGroupRecord,
	parseConfirmationRepRecord,
} from "./confirmation-record";
import { parseGroupReportSummaryRecord } from "./record-summary";
import { parseSessionAttemptRecord } from "./session-record";

async function confirmationEvidence(
	outcome: ConfirmationGroupOutcome,
): Promise<{
	readonly group: ReturnType<typeof parseConfirmationGroupRecord>;
	readonly reps: readonly ReturnType<typeof parseConfirmationRepRecord>[];
	readonly attempts: readonly ReturnType<typeof parseSessionAttemptRecord>[];
	readonly report: ReturnType<typeof parseGroupReportSummaryRecord>;
}> {
	const group = parseConfirmationGroupRecord(
		await Bun.file(outcome.groupRecordFile).text(),
	);
	const reps = await Array.fromAsync(outcome.repRecordFiles, async (path) =>
		parseConfirmationRepRecord(await Bun.file(path).text()),
	);
	const attempts = await Array.fromAsync(outcome.repRecordFiles, async (path) =>
		parseSessionAttemptRecord(
			await Bun.file(join(path, "..", "attempt.json")).text(),
		),
	);
	const report = parseGroupReportSummaryRecord(
		await Bun.file(outcome.reportFile).text(),
	);

	return { attempts, group, report, reps };
}
export { confirmationEvidence as default };
