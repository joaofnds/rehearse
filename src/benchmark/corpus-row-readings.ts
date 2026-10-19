import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { INITIAL_CHECKPOINT_STAGE } from "./checkpoint";
import type { CorpusRoot } from "./corpus-file";
import { readCorpusVersion, readCorpusVersionFile } from "./corpus-version";
import { loadRunManifest } from "./manifest";
import type { RunLocation } from "./run-layout";
import { benchmarkRunPaths, checkpointStageNames } from "./run-layout";
import type { RecordStaleness } from "./staleness-report";
import { everyRecordStaleness } from "./staleness-report";

interface RowReading extends Pick<RecordStaleness, "id" | "readFiles"> {
	/** Undefined when no judgment answers for the row the history shows. */
	readonly stale: boolean | undefined;
}

/**
 * A run's row reads what any of its stages read, and is judged as the run
 * history judges it: by the stage its judge stopped, which stands under the
 * run's own id, or else by its latest checkpoint directory in pipeline order,
 * the initial one when it recorded no stage. Either carries every upstream
 * cause. A directory holding no judged record has no judgment, and neither
 * does a run whose stopped stage cannot be read, since its checkpoint would
 * read clean for a stage that may be stale.
 */
async function runRow(
	{ runsDirectory, run }: RunLocation,
	records: readonly RecordStaleness[],
	stopUnreadable: boolean,
): Promise<RowReading> {
	const manifest = await loadRunManifest(
		benchmarkRunPaths(runsDirectory, run).manifestFile,
	);
	const recorded = new Set(await checkpointStageNames(runsDirectory, run));
	const latest =
		manifest.pipeline.stages
			.map(({ name }) => name)
			.findLast((name) => recorded.has(name)) ?? INITIAL_CHECKPOINT_STAGE;
	const judged = stopUnreadable
		? undefined
		: (records.find(({ id }) => id === `run:${run}`) ??
			records.find(({ id }) => id === `checkpoint:${run}/${latest}`));

	return {
		id: `run:${run}`,
		readFiles: records.flatMap(({ readFiles }) => readFiles),
		stale: judged?.stale,
	};
}

async function rowReadings(
	runsDirectory: string,
	source: CorpusRoot,
): Promise<readonly RowReading[]> {
	const every = await everyRecordStaleness(runsDirectory, source);
	const { byRun, unreadable } = every.checkpoints;
	const unreadableIds = new Set(unreadable.map(({ id }) => id));
	const reports = [every.sessionAttempts, every.replayAttempts, every.groups];
	const runs = await Promise.all(
		[...byRun.entries()].map(
			async ([run, records]) =>
				await runRow(
					{ run, runsDirectory },
					records,
					unreadableIds.has(`run:${run}`),
				),
		),
	);

	return [...runs, ...reports.flatMap(({ records }) => records)];
}

/** One file of a corpus written to a scratch directory, read when it is written. */
interface ScratchFile {
	readonly path: string;
	readonly bytes: () => Promise<Readonly<Uint8Array>>;
}

/**
 * The rows judged against a corpus that exists only as files, judged as
 * `stale` judges the live corpus: the files are written to a scratch
 * directory and judged as a corpus source.
 */
async function rowsJudgedAgainst(
	runsDirectory: string,
	files: readonly ScratchFile[],
): Promise<readonly RowReading[]> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-corpus-version-"));
	try {
		await Array.fromAsync(files, async ({ path, bytes }) => {
			const file = join(root, path);
			await mkdir(dirname(file), { recursive: true });
			await Bun.write(file, await bytes());
		});

		return await rowReadings(runsDirectory, { kind: "directory", root });
	} finally {
		await rm(root, { force: true, recursive: true });
	}
}

/** The ids of the rows judged fresh against a stored version. */
async function freshAgainst(
	runsDirectory: string,
	version: string,
): Promise<ReadonlySet<string>> {
	const files = await readCorpusVersion(runsDirectory, version);
	const rows = await rowsJudgedAgainst(
		runsDirectory,
		files.map(({ path }) => ({
			bytes: async () =>
				await readCorpusVersionFile(runsDirectory, version, path),
			path,
		})),
	);

	return new Set(
		rows.filter(({ stale }) => stale === false).map(({ id }) => id),
	);
}
export { rowReadings, rowsJudgedAgainst, freshAgainst };
export type { RowReading };
