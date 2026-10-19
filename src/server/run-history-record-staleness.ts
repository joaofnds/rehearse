import type { CorpusRoot } from "#benchmark/corpus-file";
import {
	checkpointReport,
	everyRecordStaleness,
} from "#benchmark/staleness-report";
import type { CorpusUnderTestReader } from "#benchmark/staleness-report";
import { formatRecordId, parseRecordId } from "#cli/record-id";
import { redactAbsolutePaths } from "#server/redact-path";
import UNJUDGED_REASON from "#server/row-staleness";
import type { RowStaleness } from "#server/row-staleness";
import type { Staleness } from "#server/run-history-contract";

/**
 * Every record's staleness by its Record ID, judged with the knobs each record
 * was recorded with: the run history compares a record against the corpus
 * under test, not against a replay about to run. A record the report named as
 * unreadable is unavailable for its reason, and a record the report never
 * reached, a run with no manifest or an attempt of a case no longer declared,
 * is unavailable too, since reading it as clean would claim a judgment nobody
 * made.
 */
async function recordStaleness(
	runsDirectory: string,
	source: CorpusRoot,
	readUnderTest?: CorpusUnderTestReader,
): Promise<Staleness> {
	const every = await everyRecordStaleness(
		runsDirectory,
		source,
		readUnderTest,
	);
	const reports = [
		checkpointReport(every.checkpoints),
		every.sessionAttempts,
		every.replayAttempts,
		every.groups,
	];
	const { judgedById, unreadableById } = stalenessIndexes(reports);
	const of = (recordId: string): RowStaleness =>
		unreadableById.get(recordId) ??
		judgedById.get(recordId) ??
		unreadableById.get(runOfCheckpoint(recordId)) ?? {
			reasons: [UNJUDGED_REASON],
			state: "unavailable",
		};

	return {
		of,
		ofRun: (run, latestCheckpoint) =>
			judgedById.get(formatRecordId({ kind: "run", run })) ??
			unreadableById.get(formatRecordId({ kind: "run", run })) ??
			of(latestCheckpoint),
		records: new Map([...judgedById, ...unreadableById]),
	};
}

/**
 * A run whose checkpoints do not parse is unreadable as a whole, so each of
 * its checkpoints answers with the run's reason.
 */
function runOfCheckpoint(recordId: string): string {
	const id = parseRecordId(recordId);

	return id.kind === "checkpoint"
		? formatRecordId({ kind: "run", run: id.run })
		: recordId;
}

type StalenessReport = Awaited<
	ReturnType<typeof everyRecordStaleness>
>["sessionAttempts"];

interface StalenessIndexes {
	readonly judgedById: ReadonlyMap<string, RowStaleness>;
	readonly unreadableById: ReadonlyMap<string, RowStaleness>;
}

function stalenessIndexes(
	reports: readonly StalenessReport[],
): StalenessIndexes {
	const judgedById = new Map<string, RowStaleness>();
	for (const {
		id,
		readFiles: _read,
		readManifest: _manifest,
		...judged
	} of reports.flatMap(({ records }) => records)) {
		judgedById.set(id, { state: "available", ...judged });
	}

	const unreadableById = new Map<string, RowStaleness>();
	for (const { id, reason } of reports.flatMap(
		({ unreadable }) => unreadable,
	)) {
		unreadableById.set(id, {
			reasons: [redactAbsolutePaths(reason)],
			state: "unavailable",
		});
	}

	return { judgedById, unreadableById };
}

export { recordStaleness as default };
