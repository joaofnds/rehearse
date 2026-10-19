import concurrentMap from "./concurrent-map";
import type { Immutable } from "./contracts";
import { recordedRunNames } from "./run-layout";
import { runCheckpointStaleness } from "./staleness-checkpoint-history";
import type { RunStaleness } from "./staleness-checkpoint-history";
import type {
	CurrentSessionKnobs,
	RecordStaleness,
	StalenessReport,
	UnreadableStaleRecord,
} from "./staleness-contract";
import type { CorpusJudgedAgainst } from "./staleness-current-corpus";

/** Every run's checkpoints in one report. */
function checkpointReport({
	byRun,
	unreadable,
}: CheckpointStalenessByRun): StalenessReport {
	return { records: [...byRun.values()].flat(), unreadable };
}

interface CheckpointStalenessByRun {
	/** Each readable run's checkpoints in chain order, then its stopped stage. */
	readonly byRun: ReadonlyMap<string, readonly RecordStaleness[]>;
	readonly unreadable: readonly UnreadableStaleRecord[];
}

/**
 * Every recorded run's checkpoints judged against one reading of the corpus,
 * keyed by run.
 */
async function checkpointStalenessAgainst(
	runsDirectory: string,
	against: CorpusJudgedAgainst,
	knobs: CurrentSessionKnobs,
): Promise<CheckpointStalenessByRun> {
	const readings = await concurrentMap(
		await recordedRunNames(runsDirectory),
		async (run) => {
			try {
				return {
					judged: await runCheckpointStaleness(
						{ run, runsDirectory },
						against,
						knobs,
					),
					run,
				};
			} catch (error) {
				return {
					run,
					unreadable: {
						id: `run:${run}`,
						reason: error instanceof Error ? error.message : String(error),
					},
				};
			}
		},
	);
	return checkpointReadingsReport(readings);
}

interface CheckpointStalenessReading {
	readonly run: string;
	readonly judged?: RunStaleness | undefined;
	readonly unreadable?: UnreadableStaleRecord | undefined;
}

function checkpointReadingsReport(
	readings: Immutable<readonly CheckpointStalenessReading[]>,
): CheckpointStalenessByRun {
	const byRun = new Map<string, readonly RecordStaleness[]>();
	const unreadable: UnreadableStaleRecord[] = [];
	for (const reading of readings) {
		if (reading.unreadable !== undefined) {
			unreadable.push(reading.unreadable);
		}
		if (reading.judged !== undefined) {
			byRun.set(reading.run, reading.judged.records);
			if (reading.judged.unreadableStop !== undefined) {
				unreadable.push(reading.judged.unreadableStop);
			}
		}
	}
	return { byRun, unreadable };
}

export { checkpointReport, checkpointStalenessAgainst };

export type { CheckpointStalenessByRun };
