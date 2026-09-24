import { loadRunManifest } from "#benchmark/manifest";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import {
	checkpointStageNumber,
	formatCheckpointShortId,
	readAllShortIds,
} from "#benchmark/short-id";
import { formatRecordId } from "#cli/record-id";

/** What a listing prints in the short id column for a record with none. */
export const NO_SHORT_ID = "-";

export async function shortIdsByRecordId(
	runsDirectory: string,
): Promise<ReadonlyMap<string, string>> {
	const entries = await readAllShortIds(runsDirectory);

	return new Map(
		entries.map(({ shortId, record }) => [formatRecordId(record), shortId]),
	);
}

/**
 * The stages a run froze into its manifest when it started, which is what a
 * checkpoint label counts, or none for a run whose manifest is gone.
 */
export async function frozenStages(
	runsDirectory: string,
	run: string,
): Promise<readonly string[]> {
	const { manifestFile } = benchmarkRunPaths(runsDirectory, run);
	if (!(await Bun.file(manifestFile).exists())) {
		return [];
	}
	const manifest = await loadRunManifest(manifestFile);

	return manifest.pipeline.stages.map(({ name }) => name);
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
	const number = checkpointStageNumber(
		await frozenStages(runsDirectory, run),
		stage,
	);

	return number === undefined
		? undefined
		: formatCheckpointShortId(runShortId, number);
}
