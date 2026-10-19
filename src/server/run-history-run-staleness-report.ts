import { INITIAL_CHECKPOINT_STAGE } from "#benchmark/checkpoint";
import concurrentMap from "#benchmark/concurrent-map";
import type { CorpusRoot } from "#benchmark/corpus-file";
import { recordedRunNames } from "#benchmark/run-layout";
import { formatRecordId } from "#cli/record-id";
import { redactAbsolutePaths } from "#server/redact-path";
import type { RowStaleness } from "#server/row-staleness";
import recordStaleness from "#server/run-history-record-staleness";
import { latestCheckpointStage } from "#server/run-status";

/** Current judgments by run-list identity, without rebuilding the list's saved readings. */
async function runStalenessReport(
	runsDirectory: string,
	source: CorpusRoot,
): Promise<{ readonly records: Readonly<Record<string, RowStaleness>> }> {
	const staleness = await recordStaleness(runsDirectory, source);
	const runs = await concurrentMap(
		await recordedRunNames(runsDirectory),
		async (run) => {
			const id = formatRecordId({ kind: "run", run });
			try {
				const stage = await latestCheckpointStage(runsDirectory, run);
				return [
					id,
					staleness.ofRun(
						run,
						formatRecordId({
							kind: "checkpoint",
							run,
							stage: stage ?? INITIAL_CHECKPOINT_STAGE,
						}),
					),
				] as const;
			} catch (error) {
				return [
					id,
					{
						reasons: [
							redactAbsolutePaths(
								error instanceof Error ? error.message : String(error),
							),
						],
						state: "unavailable",
					},
				] as const;
			}
		},
	);

	return { records: Object.fromEntries([...staleness.records, ...runs]) };
}

export { runStalenessReport as default };
