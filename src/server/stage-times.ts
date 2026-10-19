import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { loadRunManifest } from "#benchmark/manifest";
import { benchmarkRunPaths, recordedRunNames } from "#benchmark/run-layout";
import readOptionalRecord from "#server/optional-record";

import type { Reading } from "./run-record";
import { readStageFile, stageStatus } from "./run-record";

const MEDIAN_PAIR_SIZE = 2;
const EVEN_SAMPLE_COUNT_REMAINDER = 0;
const LOWER_MEDIAN_INDEX_OFFSET = 1;

const MIDPOINT_DIVISOR = 2;

const NO_STAGE_TIME_SAMPLE_MS = 0;

const EMPTY_COLLECTION_LENGTH = 0;

const NO_PRIOR_RUN_REASON = "no prior run of this case";

function noRecordedTimeReason(stage: string): string {
	return `no prior run of this case recorded a time for ${stage}`;
}

type StageTime = { readonly stage: string } & Reading<{
	readonly medianMs: number;
}>;

/** How long each stage of a run took in earlier runs of its case, in pipeline order. */
interface StageTimes {
	readonly stages: readonly StageTime[];
}

function median(values: readonly number[]): number {
	const sorted = values.toSorted((left, right) => left - right);
	const middle = Math.floor(sorted.length / MIDPOINT_DIVISOR);

	return sorted.length % MEDIAN_PAIR_SIZE === EVEN_SAMPLE_COUNT_REMAINDER
		? ((sorted[middle - LOWER_MEDIAN_INDEX_OFFSET] ?? NO_STAGE_TIME_SAMPLE_MS) +
				(sorted[middle] ?? NO_STAGE_TIME_SAMPLE_MS)) /
				MEDIAN_PAIR_SIZE
		: (sorted[middle] ?? NO_STAGE_TIME_SAMPLE_MS);
}

/**
 * The runs of a case recorded before this one. Run names are the times the
 * runs started, so they sort in that order.
 */
async function earlierRunsOfCase(
	runsDirectory: string,
	run: string,
	caseId: string,
): Promise<readonly string[]> {
	const earlier: string[] = [];
	await Array.fromAsync(await recordedRunNames(runsDirectory), async (name) => {
		const { manifestFile } = benchmarkRunPaths(runsDirectory, name);
		if (name < run && (await Bun.file(manifestFile).exists())) {
			const manifest = await readOptionalRecord(
				async () => await loadRunManifest(manifestFile),
			);
			if (manifest?.caseId === caseId) {
				earlier.push(name);
			}
		}
	});

	return earlier;
}

/**
 * The times a stage took where it finished. A stop record keeps the time up to
 * a ceiling or operator stop, which would read as the stage being quick.
 */
async function recordedTimes(
	runsDirectory: string,
	runs: readonly string[],
	stage: string,
): Promise<readonly number[]> {
	const times: number[] = [];
	await Array.fromAsync(runs, async (run) => {
		const file = await readOptionalRecord(
			async () =>
				await readStageFile(benchmarkRunPaths(runsDirectory, run), stage),
		);
		if (stageStatus(file) === "graded" && file?.elapsedMs !== undefined) {
			times.push(file.elapsedMs);
		}
	});

	return times;
}

/**
 * The median elapsed time each stage of the run recorded in earlier runs of
 * the same case, the basis of the run's remaining estimate (doc-186 Decision 6).
 */
async function readStageTimes(
	runsDirectory: string,
	run: string,
): Promise<StageTimes> {
	const { manifestFile } = benchmarkRunPaths(runsDirectory, run);
	if (!(await Bun.file(manifestFile).exists())) {
		throw new RefusedPreconditionError(`No pipeline run ${run} is recorded`);
	}
	const manifest = await loadRunManifest(manifestFile);
	const earlier = await earlierRunsOfCase(runsDirectory, run, manifest.caseId);

	const stages: StageTime[] = [];
	await Array.fromAsync(manifest.pipeline.stages, async ({ name }) => {
		const times = await recordedTimes(runsDirectory, earlier, name);
		if (times.length === EMPTY_COLLECTION_LENGTH) {
			stages.push({
				reasons: [
					earlier.length === EMPTY_COLLECTION_LENGTH
						? NO_PRIOR_RUN_REASON
						: noRecordedTimeReason(name),
				],
				stage: name,
				state: "unavailable",
			});
		} else {
			stages.push({ medianMs: median(times), stage: name, state: "available" });
		}
	});

	return { stages };
}

export { NO_PRIOR_RUN_REASON, noRecordedTimeReason, readStageTimes };
export type { StageTime, StageTimes };
