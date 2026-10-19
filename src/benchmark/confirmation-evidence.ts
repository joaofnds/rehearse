import { rm } from "node:fs/promises";

import GroupStoppedError from "./confirmation-group-finalization-contract";
import type {
	ConfirmationGroupFinalization,
	ConfirmationGroupOutcome,
} from "./confirmation-group-finalization-contract";
import type { FinalizedGroupReport } from "./confirmation-group-report";
import {
	groupRecord,
	groupReliability,
	groupReport,
	readGroupRepRecords,
} from "./confirmation-group-report";
import type { Immutable } from "./contracts";
import { operatorStopped } from "./operator-stop";

const JSON_INDENTATION_SPACES = 2;

async function finalizeConfirmationGroup(
	finalization: Immutable<ConfirmationGroupFinalization>,
): Promise<ConfirmationGroupOutcome> {
	if (await operatorStopped(finalization)) {
		throw new GroupStoppedError(finalization.groupId);
	}

	const repRecordFiles = finalization.repResults.map(
		({ recordFile }) => recordFile,
	);
	const records = await readGroupRepRecords(repRecordFiles);
	const report = await groupReport(
		finalization,
		records,
		groupReliability(finalization, records),
	);
	const group = groupRecord(finalization, repRecordFiles);

	await writeGroupEvidence(finalization, report, group);

	if (
		finalization.repResults.every(({ preservedWorktree }) => !preservedWorktree)
	) {
		await rm(finalization.worktreesDirectory, { force: true, recursive: true });
	}

	return {
		groupRecordFile: finalization.groupFile,
		repRecordFiles,
		reportFile: finalization.reportFile,
	};
}

async function writeGroupEvidence(
	finalization: Immutable<ConfirmationGroupFinalization>,
	report: FinalizedGroupReport,
	group: Immutable<ReturnType<typeof groupRecord>>,
): Promise<void> {
	await Bun.write(
		finalization.reportFile,
		`${JSON.stringify(report, null, JSON_INDENTATION_SPACES)}\n`,
	);

	await Bun.write(
		finalization.groupFile,
		`${JSON.stringify(group, null, JSON_INDENTATION_SPACES)}\n`,
	);
}

export { finalizeConfirmationGroup };
export {
	writeFrozenFile,
	frozenDirectoryFiles,
} from "./frozen-confirmation-files";
export {
	settleCompletedConfirmationRep,
	settleDiagnosticConfirmationRep,
} from "./confirmation-rep-settlement";
export { default as GroupStoppedError } from "./confirmation-group-finalization-contract";
export { default as collectConfirmationMetrics } from "./confirmation-provider-metrics";
export type { FrozenFile } from "./frozen-confirmation-files";
export type { ConfirmationRepResult } from "./confirmation-rep-settlement";
export type { ConfirmationGroupOutcome } from "./confirmation-group-finalization-contract";
export type { ConfirmationProviderCalls } from "./confirmation-provider-metrics";
