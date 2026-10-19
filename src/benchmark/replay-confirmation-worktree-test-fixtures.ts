import { dirname, join } from "node:path";

import { z } from "zod";

import { materializeCheckpoint } from "./checkpoint";
import { captureBaselineContext, captureFileHashes } from "./checks";
import { runCommand } from "./command";
import {
	confirmationRepRecordSchema,
	parseConfirmationGroupRecord,
} from "./confirmation-record";
import type { ConfirmationRepRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";
import type { ReplayDependencies } from "./replay";
import { addWorktree, currentSha, removeWorktree } from "./target";

const REAL_REPLAY_WORKTREES: Pick<
	ReplayDependencies,
	| "addWorktree"
	| "captureBaselineContext"
	| "captureFileHashes"
	| "currentSha"
	| "materializeCheckpoint"
	| "removeWorktree"
> = {
	addWorktree,
	captureBaselineContext,
	captureFileHashes,
	currentSha,
	materializeCheckpoint,
	removeWorktree,
};

async function readReplayRep(file: string): Promise<ConfirmationRepRecord> {
	const text = await Bun.file(file).text();
	return confirmationRepRecordSchema.parse(JSON.parse(text));
}
async function readReplayReps(
	files: readonly string[],
): Promise<readonly ConfirmationRepRecord[]> {
	return await Promise.all(
		files.map(async (file) => await readReplayRep(file)),
	);
}
async function readReplayGroup(
	file: string,
): Promise<ReturnType<typeof parseConfirmationGroupRecord>> {
	const text = await Bun.file(file).text();
	return parseConfirmationGroupRecord(text);
}
const FIRST_RECORDED_STAGE_INDEX = 0;
const evidenceSchema = z.object({
	evidence: z.object({ recordFile: z.string() }),
});
async function readReplayJudgeEvidence(
	records: readonly Immutable<ConfirmationRepRecord>[],
	files: readonly string[],
): Promise<readonly unknown[]> {
	const references = records.map(
		({ stages }) =>
			evidenceSchema.parse(stages[FIRST_RECORDED_STAGE_INDEX]).evidence,
	);
	return await Promise.all(
		references.map(async ({ recordFile }, index) => {
			const text = await Bun.file(
				join(dirname(files[index] ?? "missing"), recordFile),
			).text();
			return z.unknown().parse(JSON.parse(text));
		}),
	);
}
async function readReplayEvidenceRefs(
	records: readonly Immutable<ConfirmationRepRecord>[],
	sourceRoot: string,
	groupId: string,
): Promise<readonly string[]> {
	return await Promise.all(
		records.map(async (record) => {
			const [stage] = record.stages;
			if (stage?.status === "NOT_REACHED" || stage?.evidence === undefined) {
				throw new Error("Expected durable stage evidence");
			}

			return await runCommand(
				["git", "rev-parse", `refs/rehearse/${groupId}/${record.repId}`],
				sourceRoot,
			);
		}),
	);
}
export {
	REAL_REPLAY_WORKTREES,
	readReplayRep,
	readReplayReps,
	readReplayGroup,
	readReplayJudgeEvidence,
	readReplayEvidenceRefs,
};
