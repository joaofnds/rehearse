import { loadRunManifest } from "#benchmark/manifest";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import {
	checkpointStageNumber,
	formatCheckpointShortId,
	readAllShortIds,
} from "#benchmark/short-id";
import type { ShortIdEntry } from "#benchmark/short-id";
import { controlRelative } from "#cli/output";
import type { UnreadableRecord } from "#cli/output";
import { formatRecordId } from "#cli/record-id";

/** What a listing prints in the short id column for a record with none. */
export const NO_SHORT_ID = "-";

export function shortIdsOf(
	entries: readonly ShortIdEntry[],
): ReadonlyMap<string, string> {
	return new Map(
		entries.map(({ shortId, record }) => [formatRecordId(record), shortId]),
	);
}

export interface ShortIdColumn {
	readonly shortIds: ReadonlyMap<string, string>;
	readonly unreadable: readonly UnreadableRecord[];
}

/**
 * A case registry that cannot be read leaves its own records without short
 * ids and is reported by its directory, so the listing beside it still
 * prints every other case's.
 */
export async function shortIdsByRecordId(
	runsDirectory: string,
): Promise<ShortIdColumn> {
	const { entries, unreadable } = await readAllShortIds(runsDirectory);

	return {
		shortIds: shortIdsOf(entries),
		unreadable: unreadable.map(({ registry, reason }) => ({
			id: registry,
			reason: controlRelative(reason),
		})),
	};
}

/**
 * The stages a run froze into its manifest when it started, which is what a
 * checkpoint label counts, none for a run whose manifest is gone, and
 * undefined for one whose manifest cannot be read. A label is a column beside
 * a record, so one bad manifest leaves its run's checkpoints unlabelled rather
 * than hiding every other checkpoint from the listing.
 */
export async function frozenStages(
	runsDirectory: string,
	run: string,
): Promise<readonly string[] | undefined> {
	const { manifestFile } = benchmarkRunPaths(runsDirectory, run);
	if (!(await Bun.file(manifestFile).exists())) {
		return [];
	}
	const manifest = await loadRunManifest(manifestFile).catch(() => undefined);

	return manifest?.pipeline.stages.map(({ name }) => name);
}

export async function checkpointShortId(
	runsDirectory: string,
	shortIds: ReadonlyMap<string, string>,
	run: string,
	stage: string,
): Promise<string | undefined> {
	const runShortId = shortIds.get(formatRecordId({ kind: "run", run }));
	if (runShortId === undefined) {
		return undefined;
	}
	const stages = await frozenStages(runsDirectory, run);
	const number =
		stages === undefined ? undefined : checkpointStageNumber(stages, stage);

	return number === undefined
		? undefined
		: formatCheckpointShortId(runShortId, number);
}
