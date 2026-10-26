import { mkdir } from "node:fs/promises";

import { RUN } from "./compare-attempts-test-support";
import type { CorpusRoot } from "./corpus-file";
import { resolveCorpusFile } from "./corpus-file";
import { liveStageSettings } from "./recorded-runs-fixture-environment";
import PipelineRecordData from "./recorded-runs-fixture-pipeline-data";
import { serialize } from "./recorded-runs-fixture-record-io";
import { benchmarkRunPaths, checkpointRecordFile } from "./run-layout";
import { captureStageCorpus } from "./stage-corpus-snapshot";

/** The stage before the replayed one, whose checkpoint a replay consumes. */
const CONSUMED_STAGE = "shape";

interface ConsumedCheckpointRecording {
	readonly runsDirectory: string;
	readonly source: CorpusRoot;
}

/**
 * Records the initial checkpoint of the run the arms replayed and the
 * checkpoint its replayed stage consumes, holding the corpus `source` holds
 * now for the consumed stage.
 */
async function recordConsumedCheckpoint({
	runsDirectory,
	source,
}: ConsumedCheckpointRecording): Promise<void> {
	const settingsFile = await liveStageSettings();
	const initial = PipelineRecordData.initialCheckpoint(settingsFile);
	const instructions = await Bun.file(
		resolveCorpusFile(source, "CLAUDE.md"),
	).text();
	const consumed = {
		...PipelineRecordData.checkpoint(CONSUMED_STAGE, settingsFile),
		corpusFiles: await captureStageCorpus(CONSUMED_STAGE, instructions, [
			source,
		]),
		upstream: initial.lineage,
	};
	const paths = benchmarkRunPaths(runsDirectory, RUN);

	await Array.fromAsync([initial, consumed], async (record) => {
		const directory = paths.checkpointDirectory(record.stage);
		await mkdir(directory, { recursive: true });
		await Bun.write(checkpointRecordFile(directory), serialize(record));
	});
}

export { CONSUMED_STAGE, recordConsumedCheckpoint };
