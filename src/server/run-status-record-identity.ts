import { loadRunManifest } from "#benchmark/manifest";
import { recordFileExists } from "#benchmark/record-read-scope";
import { parseRunSummaryRecord } from "#benchmark/record-summary";
import { benchmarkRunPaths, checkpointStageNames } from "#benchmark/run-layout";
import type { BenchmarkRunPaths } from "#benchmark/run-layout";
import type {
	ContextLink,
	RunIdentity,
	RunProgress,
} from "#server/run-status-contract";
import IncompleteRunRecordError from "#server/run-status-contract";

const FINAL_STATUS_EVENT_OFFSET = -1;

/**
 * The last checkpoint a run recorded, in pipeline order rather than
 * alphabetical: `checkpointStageNames` sorts by name, which is not the order
 * stages run in, so "latest" is read off the manifest's own stage sequence
 * intersected with what the run actually recorded.
 */
async function latestCheckpointStage(
	runsDirectory: string,
	run: string,
): Promise<string | undefined> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	const { manifestFile } = paths;
	if (!(await recordFileExists(manifestFile))) {
		return undefined;
	}

	const manifest = await loadRunManifest(paths.manifestFile);
	const recorded = new Set(await checkpointStageNames(runsDirectory, run));
	const ordered = manifest.pipeline.stages
		.map(({ name }) => name)
		.filter((name) => recorded.has(name));

	return ordered.at(FINAL_STATUS_EVENT_OFFSET);
}

const RECORDED: RunProgress = { state: "recorded" };

/**
 * A run known only from its manifest (no graded artifact): the STOPPED and
 * RUNNING statuses read the case ID from there, and refuse a run whose
 * manifest never got written rather than reporting it with no case ID.
 */
async function manifestBackedIdentity(
	paths: BenchmarkRunPaths,
	status: string,
	progress: RunProgress = RECORDED,
): Promise<RunIdentity> {
	if (!(await recordFileExists(paths.manifestFile))) {
		throw new IncompleteRunRecordError(
			`incomplete: no manifest.json at ${paths.manifestFile}`,
		);
	}

	const manifest = await loadRunManifest(paths.manifestFile);

	return {
		caseId: manifest.caseId,
		gradeByStage: new Map(),
		links: [],
		progress:
			progress.state === "running"
				? { ...progress, ceilingUsd: manifest.spendCeilingUsd }
				: progress,
		status,
	};
}

/**
 * A run whose status comes from its event stream. The stream is the record
 * it ran, so a missing manifest costs the row its case, not its place in the
 * list.
 */
async function eventBackedIdentity(
	paths: BenchmarkRunPaths,
	status: string,
	links: readonly ContextLink[],
): Promise<RunIdentity> {
	const caseId = (await recordFileExists(paths.manifestFile))
		? await sourceCaseId(paths.manifestFile)
		: undefined;

	return { caseId, gradeByStage: new Map(), links, progress: RECORDED, status };
}

function artifactIdentity(artifact: string): RunIdentity {
	const record = parseRunSummaryRecord(artifact);

	return {
		caseId: record.caseId,
		gradeByStage: new Map(
			record.stageScorecards.map((scorecard) => [
				scorecard.stage,
				scorecard.grade.grade,
			]),
		),
		links: [],
		progress: RECORDED,
		status: record.status,
	};
}

async function sourceCaseId(manifestFile: string): Promise<string> {
	const manifest = await loadRunManifest(manifestFile);

	return manifest.caseId;
}

export {
	manifestBackedIdentity,
	eventBackedIdentity,
	artifactIdentity,
	sourceCaseId,
	latestCheckpointStage,
};
