import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { HashedFile } from "./checkpoint";
import type { CorpusRoot } from "./corpus-file";
import { hashCorpusLayout } from "./corpus-layout";
import {
	readCorpusUnderTest,
	readCorpusVersion,
	readCorpusVersionFile,
} from "./corpus-version";
import { checkpointStageNames } from "./run-layout";
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

interface RowReading extends Pick<RecordStaleness, "id" | "readFiles"> {
	/** Undefined when no judgment answers for the row the history shows. */
	readonly stale: boolean | undefined;
}

/**
 * A run's row reads what any of its checkpoints read, and is stale as its
 * latest checkpoint is, since that one carries every upstream cause. The run
 * history judges the run by its latest checkpoint directory, so a run whose
 * latest directory holds no judged checkpoint has no judgment to count.
 */
async function runRow(
	runsDirectory: string,
	run: string,
	checkpoints: readonly RecordStaleness[],
): Promise<RowReading> {
	const judged = new Set(checkpoints.map(({ id }) => id));
	const recorded = await checkpointStageNames(runsDirectory, run);
	const complete = recorded.every((stage) =>
		judged.has(`checkpoint:${run}/${stage}`),
	);

	return {
		id: `run:${run}`,
		stale: complete ? checkpoints.at(-1)?.stale : undefined,
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
	const runs = await Promise.all(
		[...byRun.entries()].map(([run, checkpoints]) =>
			runRow(runsDirectory, run, checkpoints),
		),
	);

	return [...runs, ...reports.flatMap(({ records }) => records)];
}

/**
 * The ids of the rows judged fresh against a stored version, judged as
 * `stale` judges the live corpus: the version's files are written to a
 * scratch directory and judged as a corpus source.
 */
async function freshAgainst(
	runsDirectory: string,
	version: string,
): Promise<ReadonlySet<string>> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-corpus-version-"));
	try {
		for (const { path } of await readCorpusVersion(runsDirectory, version)) {
			const file = join(root, path);
			await mkdir(dirname(file), { recursive: true });
			await Bun.write(
				file,
				await readCorpusVersionFile(runsDirectory, version, path),
			);
		}
		const rows = await rowReadings(runsDirectory, {
			kind: "directory",
			root,
		});

		return new Set(
			rows.filter(({ stale }) => stale === false).map(({ id }) => id),
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

function hashesByPath(
	files: readonly HashedFile[],
): ReadonlyMap<string, string> {
	return new Map(files.map(({ path, sha256 }) => [path, sha256]));
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
					layout.refusals.length > 0
						? "the corpus under test refused hashing, so it has no place in its log"
						: "the corpus under test has no earlier version in its log to compare against",
			},
		};
	}

	const previous = hashesByPath(
		await readCorpusVersion(runsDirectory, underTest.previousVersion),
	);
	const freshBefore = await freshAgainst(
		runsDirectory,
		underTest.previousVersion,
	);
	const invalidatedRows = rows
		.filter(({ id, stale }) => stale === true && freshBefore.has(id))
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
