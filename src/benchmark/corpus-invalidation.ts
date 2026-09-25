import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { HashedFile } from "./checkpoint";
import type { CorpusRoot } from "./corpus-file";
import { hashCorpusLayout } from "./corpus-layout";
import { corpusVersionLabel } from "./corpus-version-label";
import {
	CorpusVersionError,
	readCorpusUnderTest,
	readCorpusVersion,
	readCorpusVersionFile,
} from "./corpus-version";
import { INITIAL_CHECKPOINT_STAGE } from "./checkpoint";
import { loadRunManifest } from "./manifest";
import { benchmarkRunPaths, checkpointStageNames } from "./run-layout";
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
 * A run's row reads what any of its checkpoints read, and is judged as the
 * run history judges it: by its latest checkpoint directory in pipeline
 * order, the initial one when it recorded no stage, which carries every
 * upstream cause. A directory holding no judged record has no judgment.
 */
async function runRow(
	runsDirectory: string,
	run: string,
	checkpoints: readonly RecordStaleness[],
): Promise<RowReading> {
	const manifest = await loadRunManifest(
		benchmarkRunPaths(runsDirectory, run).manifestFile,
	);
	const recorded = new Set(await checkpointStageNames(runsDirectory, run));
	const latest =
		manifest.pipeline.stages
			.map(({ name }) => name)
			.findLast((name) => recorded.has(name)) ?? INITIAL_CHECKPOINT_STAGE;
	const judged = checkpoints.find(
		({ id }) => id === `checkpoint:${run}/${latest}`,
	);

	return {
		id: `run:${run}`,
		stale: judged?.stale,
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

/**
 * The previous version's hashes and the rows fresh against it, undefined
 * when the store no longer holds its manifest or one of its files.
 */
async function judgedAgainst(
	runsDirectory: string,
	version: string,
): Promise<
	| {
			readonly previous: ReadonlyMap<string, string>;
			readonly freshBefore: ReadonlySet<string>;
	  }
	| undefined
> {
	try {
		return {
			previous: hashesByPath(await readCorpusVersion(runsDirectory, version)),
			freshBefore: await freshAgainst(runsDirectory, version),
		};
	} catch (error) {
		if (
			error instanceof CorpusVersionError ||
			(error instanceof Error && "code" in error && error.code === "ENOENT")
		) {
			return undefined;
		}

		throw error;
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

	const judgedBefore = await judgedAgainst(
		runsDirectory,
		underTest.previousVersion,
	);
	if (judgedBefore === undefined) {
		return {
			readBy,
			invalidated: new Map(),
			lastEdit: {
				kind: "not-recorded",
				reason: `the previous version ${corpusVersionLabel(underTest.previousVersion)} cannot be read from the store`,
			},
		};
	}

	const { previous, freshBefore } = judgedBefore;
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
