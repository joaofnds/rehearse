import { readChangedFilesOnly } from "./checkpoint";
import type { Immutable } from "./contracts";
import { readReplayRecord } from "./replay-record";
import type { ParsedReplayRecord } from "./replay-record";
import type { StageAttemptId } from "./run-layout";
import { replayAttemptIds, replayRecordFile } from "./run-layout";
import type {
	CurrentSessionKnobs,
	RecordStaleness,
	StalenessReport,
	UnreadableStaleRecord,
} from "./staleness-contract";
import { stageCorpusNow } from "./staleness-current-corpus";
import type { CorpusJudgedAgainst } from "./staleness-current-corpus";
import namedKnobCauses from "./staleness-knobs";
import { judgedReads } from "./staleness-read-manifest";
import replayedStage from "./staleness-replay-definition";
import { rubricCauses } from "./staleness-rubrics";

const NO_STALENESS_CAUSES = 0;

const EMPTY_COLLECTION_LENGTH = 0;

class ReplayStalenessRecords {
	private readonly records: RecordStaleness[] = [];
	private readonly unreadable: UnreadableStaleRecord[] = [];
	private readonly staleCheckpointsById: ReadonlyMap<string, RecordStaleness>;
	private readonly unreadableRuns: ReadonlySet<string>;
	public constructor(
		private readonly runsDirectory: string,
		private readonly against: CorpusJudgedAgainst,
		private readonly comparison: ReplayStalenessComparison,
	) {
		const { upstream } = comparison;
		this.staleCheckpointsById = new Map(
			upstream.records
				.filter(({ stale }) => stale)
				.map((checkpoint) => [checkpoint.id, checkpoint]),
		);
		this.unreadableRuns = new Set(upstream.unreadable.map(({ id }) => id));
	}
	public async read({ lineage, timestamp }: StageAttemptId): Promise<void> {
		const { runsDirectory } = this;
		const id = `attempt:stage:${lineage}/${timestamp}`;
		try {
			const record = await readReplayRecord(
				replayRecordFile(runsDirectory, lineage, timestamp),
			);
			if (this.unreadableRuns.has(`run:${record.runName}`)) {
				throw new Error(
					`the run ${record.runName} it replayed cannot be read to judge its upstream stages`,
				);
			}
			this.records.push(await this.judge(record, id));
		} catch (error) {
			this.unreadable.push({
				id,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}
	public report(): StalenessReport {
		return { records: this.records, unreadable: this.unreadable };
	}
	private async judge(
		record: Immutable<ParsedReplayRecord>,
		id: string,
	): Promise<RecordStaleness> {
		const {
			runsDirectory,
			against: { source, instructions, underTest },
			comparison: { knobs },
		} = this;
		const definition = await replayedStage(runsDirectory, record);
		const corpus = await judgedReads(record, {
			current: await stageCorpusNow(definition.skill, instructions, source),
			definition,
			source,
		});
		const consumed = this.staleCheckpointsById.get(
			`checkpoint:${record.runName}/${record.consumed.stage}`,
		);
		const knobCauses = namedKnobCauses(record, knobs);
		const rubric = rubricCauses(corpus.readManifest);
		const causes = [
			...(consumed === undefined
				? []
				: [`upstream stage ${record.consumed.stage} is stale`]),
			...knobCauses,
			...corpus.causes,
			...rubric,
		];
		return {
			causes,
			changedFiles: corpus.changedFiles,
			distance: underTest.distanceOf(record.corpusVersion),
			id,
			onlyCorpusFiles:
				knobCauses.length === EMPTY_COLLECTION_LENGTH &&
				rubric.length === EMPTY_COLLECTION_LENGTH &&
				(consumed === undefined || consumed.onlyCorpusFiles) &&
				readChangedFilesOnly(corpus),
			readFiles: corpus.readFiles,
			readManifest: corpus.readManifest,
			stale: causes.length > NO_STALENESS_CAUSES,
		};
	}
}

interface ReplayStalenessComparison {
	readonly upstream: StalenessReport;
	readonly knobs: CurrentSessionKnobs;
}

/** Given `upstream`, every checkpoint judged with no knob named. */
async function replayAttemptStalenessAgainst(
	runsDirectory: string,
	against: CorpusJudgedAgainst,
	comparison: ReplayStalenessComparison,
): Promise<StalenessReport> {
	const reading = new ReplayStalenessRecords(
		runsDirectory,
		against,
		comparison,
	);
	await Array.fromAsync(
		await replayAttemptIds(runsDirectory),
		async (attempt) => {
			await reading.read(attempt);
		},
	);
	return reading.report();
}

export { replayAttemptStalenessAgainst as default };
