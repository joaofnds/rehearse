import { resolve } from "node:path";

import { TRANSCRIPT_FILE } from "#benchmark/checkpoint";
import { stoppedSessionEntry } from "#benchmark/run-layout";
import type { ResolvedHistoryInput } from "#server/history-input-contract";
import type { StageHistoryIdentityInput } from "#server/history-read-identity";
import runManifest from "#server/history-run-manifest";
import {
	awaitingJudgeStageMetadata,
	stoppedStageMetadata,
} from "#server/history-terminal-stage-metadata";
import terminalStageRecord from "#server/history-terminal-stage-record";
import { verifiedFile } from "#server/history-verified-path";

/**
 * A stage that wrote no checkpoint directory leaves a record beside the run's
 * checkpoints instead, and two terminal states write one: the run stopped on
 * this stage, or the run died between the stage's session finishing and its
 * judging completing. Neither record identifies the stage among the run's
 * others, so the case and the model come from the run manifest and no lineage
 * is reported at all. Each record's own parsed transcript stays out of the
 * report. A stopped stage's raw transcript, which the harness copies beside
 * its record, is read when present, and the unavailable state stands for a
 * stage without one.
 */
async function checkpointlessStageInput(
	root: string,
	checkpointsDirectory: string,
	identity: Readonly<StageHistoryIdentityInput>,
): Promise<ResolvedHistoryInput> {
	const { detail, stopped, recordedStage } = await terminalStageRecord(
		root,
		identity,
	);
	const declared = detail.success ? detail.data : {};
	const manifest = await runManifest(root, checkpointsDirectory);
	const common = {
		caseId: manifest.caseId,
		corpusFiles: declared.corpusFiles ?? [],
		model: declared.model ?? manifest.model,
		run: identity.run,
		stage: recordedStage,
	};
	const transcriptFile = stopped.success
		? await verifiedFile(root, {
				directory: resolve(
					root,
					stoppedSessionEntry(identity.run, recordedStage),
				),
				name: TRANSCRIPT_FILE,
				required: false,
			})
		: undefined;

	return {
		metadata: {
			...(stopped.success
				? stoppedStageMetadata(common, stopped.data.error)
				: awaitingJudgeStageMetadata(common)),
			prefixLinesExcluded: 0,
			resolvedCorpusFiles: [],
		},
		reportedCostUsd: undefined,
		root,
		transcriptFile,
	};
}

export { checkpointlessStageInput as default };
