import type { CorpusRoot } from "#benchmark/corpus-file";
import type { RunLocation } from "#benchmark/run-layout";
import type { RecordStaleness } from "#benchmark/staleness-report";
import { checkpointStalenessOfRun } from "#benchmark/staleness-report";
import { formatRecordId } from "#cli/record-id";
import { redactAbsolutePaths } from "#server/redact-path";
import {
	readHumanReview,
	stoppedStageReads,
	withJudgedReadManifest,
} from "#server/run-human-review";
import type {
	Reading,
	RunRecord,
	RunRecordStage,
} from "#server/run-record-contract";

async function judgeRunRecord(
	record: RunRecord,
	{ runsDirectory, run }: RunLocation,
	source: CorpusRoot,
): Promise<RunRecord> {
	const checkpoints = await checkpointJudgments({ run, runsDirectory }, source);
	const judged = new Map<string, RunRecordStage["readManifest"]>();
	if (checkpoints.state === "available") {
		for (const { id, readManifest } of checkpoints.records) {
			if (readManifest !== undefined) {
				judged.set(id, { entries: readManifest, state: "available" });
			}
		}
	}

	const stages: RunRecordStage[] = [];
	await Array.fromAsync(record.stages, async (stage) => {
		const recordId = formatRecordId({
			kind: "checkpoint",
			run,
			stage: stage.stage,
		});
		stages.push(
			withJudgedReadManifest(
				stage,
				checkpoints.state === "unavailable" && stage.checkpoint === "recorded"
					? checkpoints
					: (judged.get(recordId) ??
							(await stoppedStageReads(
								{ run, runsDirectory },
								stage.stage,
								source,
							))),
			),
		);
	});

	return {
		...record,
		humanReview: await readHumanReview(runsDirectory, run),
		stages,
	};
}

async function checkpointJudgments(
	{ runsDirectory, run }: RunLocation,
	source: CorpusRoot,
): Promise<Reading<{ readonly records: readonly RecordStaleness[] }>> {
	try {
		const records = await checkpointStalenessOfRun(runsDirectory, run, source);

		return { records, state: "available" };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		return { reasons: [redactAbsolutePaths(message)], state: "unavailable" };
	}
}

export { judgeRunRecord as default };
