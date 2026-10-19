import { consumedCheckpointStage } from "#benchmark/checkpoint";
import { loadRunManifest } from "#benchmark/manifest";
import { recordFileExists } from "#benchmark/record-read-scope";
import {
	benchmarkRunPaths,
	checkpointRecorded,
	checkpointStageNames,
} from "#benchmark/run-layout";
import {
	checkpointStageNumber,
	formatCheckpointShortId,
} from "#benchmark/short-id";
import { frozenStages } from "#cli/short-id-column";
import type {
	CheckpointShortId,
	RunRowIdentity,
} from "#server/run-history-contract";
import { checkpointlessStageRecorded } from "#server/run-status";
import type { ContextLink } from "#server/run-status";

/**
 * A link to every stage whose context page renders a report, in pipeline
 * order: a stage that saved a checkpoint, the stage that stopped the run, and
 * a stage left awaiting judgment. `initial` is not a pipeline stage, so
 * reading the stage list off the manifest leaves it out, and a run with no
 * manifest has no page for any stage.
 */
async function stageLinks(
	runsDirectory: string,
	run: string,
): Promise<readonly ContextLink[]> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	if (!(await recordFileExists(paths.manifestFile))) {
		return [];
	}

	const manifest = await loadRunManifest(paths.manifestFile);
	const checkpointed = new Set(await checkpointStageNames(runsDirectory, run));
	const links: ContextLink[] = [];
	await Array.fromAsync(manifest.pipeline.stages, async ({ name: stage }) => {
		if (
			(checkpointed.has(stage) && (await checkpointRecorded(paths, stage))) ||
			(await checkpointlessStageRecorded(paths, stage))
		) {
			links.push({
				href: `/runs/${encodeURIComponent(run)}/stages/${encodeURIComponent(stage)}`,
				label: stage,
				state: "available",
			});
		}
	});

	return links;
}

/**
 * The stages whose starting checkpoint is recorded, which is all a replay
 * launch checks, so a run with no short id offers its stages too. A run with
 * no manifest names no stages.
 */
async function replayableStages(
	runsDirectory: string,
	run: string,
): Promise<readonly string[]> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	if (!(await recordFileExists(paths.manifestFile))) {
		return [];
	}

	const manifest = await loadRunManifest(paths.manifestFile);
	const stages = manifest.pipeline.stages.map(({ name }) => name);
	const replayable: string[] = [];
	await Array.fromAsync(stages.entries(), async ([index, stage]) => {
		if (
			await checkpointRecorded(paths, consumedCheckpointStage(stages, index))
		) {
			replayable.push(stage);
		}
	});

	return replayable;
}

/**
 * A claimed run's recorded checkpoints by short id, numbered by the stages
 * its manifest froze, none for a run with no short id or no readable manifest.
 */
async function checkpointShortIds(
	runsDirectory: string,
	run: string,
	shortId: string | undefined,
): Promise<readonly CheckpointShortId[]> {
	const stages =
		shortId === undefined
			? undefined
			: await frozenStages({ run, runsDirectory });
	if (shortId === undefined || stages === undefined) {
		return [];
	}

	const paths = benchmarkRunPaths(runsDirectory, run);
	const numbered: { stage: string; number: number }[] = [];
	await Array.fromAsync(
		await checkpointStageNames(runsDirectory, run),
		async (stage) => {
			const number = checkpointStageNumber(stages, stage);
			if (number !== undefined && (await checkpointRecorded(paths, stage))) {
				numbered.push({ number, stage });
			}
		},
	);

	return numbered
		.toSorted((left, right) => left.number - right.number)
		.map(({ stage, number }) => ({
			shortId: formatCheckpointShortId(shortId, number),
			stage,
		}));
}

interface PipelineNavigationInput extends RunRowIdentity {
	readonly links: readonly ContextLink[];
}

interface PipelineNavigation {
	readonly links: readonly ContextLink[];
	readonly checkpoints: readonly CheckpointShortId[];
	readonly replayable: readonly string[];
}

async function pipelineNavigation({
	runsDirectory,
	run,
	shortId,
	links: previousLinks,
}: PipelineNavigationInput): Promise<PipelineNavigation> {
	const available = await stageLinks(runsDirectory, run);
	const links = [
		...available,
		...previousLinks.filter(
			({ label }) => !available.some((link) => link.label === label),
		),
	];
	const checkpoints = await checkpointShortIds(runsDirectory, run, shortId);
	const replayable = await replayableStages(runsDirectory, run);

	return { checkpoints, links, replayable };
}

export { pipelineNavigation as default };
