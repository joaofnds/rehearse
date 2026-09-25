import type { HashedFile } from "./checkpoint";
import type { CorpusRoot } from "./corpus-file";
import { hashCorpusLayout } from "./corpus-layout";
import { readCorpusUnderTest, readCorpusVersion } from "./corpus-version";
import type { RecordStaleness } from "./staleness-report";
import {
	checkpointStalenessByRun,
	groupStaleness,
	replayAttemptStaleness,
	sessionAttemptStaleness,
} from "./staleness-report";

/**
 * The run-history rows the last edit invalidated: those fresh against the
 * log entry before the corpus under test and stale against it now.
 */
export type LastEdit =
	| {
			readonly kind: "measured";
			/** The version the last edit started from. */
			readonly previous: string;
			readonly count: number;
			readonly rows: readonly string[];
	  }
	| { readonly kind: "not-recorded"; readonly reason: string };

/** Counts of distinct run-history rows, by corpus layout path. */
export interface CorpusInvalidation {
	readonly readBy: ReadonlyMap<string, number>;
	readonly invalidated: ReadonlyMap<string, number>;
	readonly lastEdit: LastEdit;
}

type RowReading = Omit<RecordStaleness, "distance">;

/**
 * A run's row reads what any of its checkpoints read, and is stale as its
 * latest checkpoint is, since that one carries every upstream cause.
 */
function runRow(
	run: string,
	checkpoints: readonly RecordStaleness[],
): RowReading | undefined {
	const latest = checkpoints.at(-1);
	if (latest === undefined) {
		return undefined;
	}

	return {
		id: `run:${run}`,
		stale: latest.stale,
		causes: latest.causes,
		onlyCorpusFiles: latest.onlyCorpusFiles,
		changedFiles: checkpoints.flatMap(({ changedFiles }) => changedFiles),
		readFiles: checkpoints.flatMap(({ readFiles }) => readFiles),
	};
}

async function rowReadings(
	runsDirectory: string,
	source: CorpusRoot,
): Promise<readonly RowReading[]> {
	const { byRun } = await checkpointStalenessByRun(runsDirectory, source);
	const reports = [
		await sessionAttemptStaleness(runsDirectory, source),
		await replayAttemptStaleness(runsDirectory, source),
		await groupStaleness(runsDirectory, source),
	];

	return [
		...[...byRun.entries()]
			.map(([run, checkpoints]) => runRow(run, checkpoints))
			.filter((row) => row !== undefined),
		...reports.flatMap(({ records }) => records),
	];
}

function hashesByPath(
	files: readonly HashedFile[],
): ReadonlyMap<string, string> {
	return new Map(files.map(({ path, sha256 }) => [path, sha256]));
}

/**
 * Fresh against the previous version when every file it read held the hash
 * that version holds and no file its stage now adds was already there, and
 * stale now only because files it read changed.
 */
function invalidatedByLastEdit(
	row: RowReading,
	previous: ReadonlyMap<string, string>,
): boolean {
	return (
		row.stale &&
		row.onlyCorpusFiles &&
		row.readFiles.every(({ path, sha256 }) => previous.get(path) === sha256) &&
		row.changedFiles.every(
			({ path, change }) => change !== "added" || !previous.has(path),
		)
	);
}

/**
 * Judged against the corpus under test, as `stale` is. Unreadable records
 * are left out, since no judgment of them exists to count.
 */
export async function corpusInvalidation(
	runsDirectory: string,
	source: CorpusRoot,
): Promise<CorpusInvalidation> {
	const underTest = await readCorpusUnderTest(runsDirectory, source);
	const layout = await hashCorpusLayout(source);
	const current = hashesByPath(layout.files);
	const rows = await rowReadings(runsDirectory, source);
	const paths = new Set(
		rows.flatMap(({ readFiles }) => readFiles.map(({ path }) => path)),
	);
	const readBy = new Map(
		[...paths].map((path) => [
			path,
			rows.filter((row) => row.readFiles.some((file) => file.path === path))
				.length,
		]),
	);

	if (underTest.previousVersion === undefined) {
		return {
			readBy,
			invalidated: new Map(),
			lastEdit: {
				kind: "not-recorded",
				reason:
					"the corpus under test has no earlier version in its log to compare against",
			},
		};
	}

	const previous = hashesByPath(
		await readCorpusVersion(runsDirectory, underTest.previousVersion),
	);
	const invalidatedRows = rows
		.filter((row) => invalidatedByLastEdit(row, previous))
		.map(({ id }) => id)
		.toSorted();
	const invalidated = new Map(
		[...paths].map((path) => [
			path,
			rows.filter((row) =>
				row.readFiles.some(
					(file) =>
						file.path === path &&
						file.sha256 === previous.get(path) &&
						file.sha256 !== current.get(path),
				),
			).length,
		]),
	);

	return {
		readBy,
		invalidated,
		lastEdit: {
			kind: "measured",
			previous: underTest.previousVersion,
			count: invalidatedRows.length,
			rows: invalidatedRows,
		},
	};
}
