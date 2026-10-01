import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { loadRunManifest } from "#benchmark/manifest";
import { benchmarkRunPaths, recordedRunNames } from "#benchmark/run-layout";
import type { Reading } from "./run-record";
import { readStageFile } from "./run-record";

export const NO_EARLIER_RUN_REASON = "no earlier run of this case";

export function noRecordedTimeReason(stage: string): string {
	return `no earlier run of this case recorded a time for ${stage}`;
}

export type StageTime = { readonly stage: string } & Reading<{
	readonly medianMs: number;
}>;

/** How long each stage of a run took in earlier runs of its case, in pipeline order. */
export interface StageTimes {
	readonly stages: readonly StageTime[];
}

function median(values: readonly number[]): number {
	const sorted = values.toSorted((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);

	return sorted.length % 2 === 0
		? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
		: (sorted[middle] ?? 0);
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
	for (const name of await recordedRunNames(runsDirectory)) {
		const { manifestFile } = benchmarkRunPaths(runsDirectory, name);
		if (name < run && (await Bun.file(manifestFile).exists())) {
			const manifest = await loadRunManifest(manifestFile);
			if (manifest.caseId === caseId) {
				earlier.push(name);
			}
		}
	}

	return earlier;
}

async function recordedTimes(
	runsDirectory: string,
	runs: readonly string[],
	stage: string,
): Promise<readonly number[]> {
	const times: number[] = [];
	for (const run of runs) {
		const file = await readStageFile(
			benchmarkRunPaths(runsDirectory, run),
			stage,
		);
		if (file?.elapsedMs !== undefined) {
			times.push(file.elapsedMs);
		}
	}

	return times;
}

/**
 * The median elapsed time each stage of the run recorded in earlier runs of
 * the same case, the basis of the run's remaining estimate (doc-186 Decision 6).
 */
export async function readStageTimes(
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
	for (const { name } of manifest.pipeline.stages) {
		const times = await recordedTimes(runsDirectory, earlier, name);
		if (times.length === 0) {
			stages.push({
				stage: name,
				state: "unavailable",
				reasons: [
					earlier.length === 0
						? NO_EARLIER_RUN_REASON
						: noRecordedTimeReason(name),
				],
			});
		} else {
			stages.push({ stage: name, state: "available", medianMs: median(times) });
		}
	}

	return { stages };
}
