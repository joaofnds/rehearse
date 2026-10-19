import { formatRecordId } from "#cli/record-id";
import type {
	PipelineRunRow,
	RunRowIdentity,
	RunRowLiveness,
	Unjudged,
} from "#server/run-history-contract";
import pipelineNavigation from "#server/run-history-pipeline-navigation";
import { runFigures } from "#server/run-history-run-figures";
import heldBy from "#server/run-history-run-holder";
import { latestCheckpointStage, statusAndCaseId } from "#server/run-status";

async function rowFor(
	{ runsDirectory, run, shortId }: RunRowIdentity,
	{ runEvents, liveness, launchByPid }: RunRowLiveness,
): Promise<Unjudged<PipelineRunRow> | undefined> {
	const identity = await statusAndCaseId(
		{ run, runsDirectory },
		runEvents,
		liveness,
	);
	if (identity === undefined) {
		return undefined;
	}

	const { status, caseId, gradeByStage, progress } = identity;
	const { links, checkpoints, replayable } = await pipelineNavigation({
		links: identity.links,
		run,
		runsDirectory,
		shortId,
	});
	const figures = await runFigures(
		{ run, runsDirectory },
		{ liveness, runEvents },
	);
	const stage = await latestCheckpointStage(runsDirectory, run);
	const launchId =
		status === "RUNNING"
			? await heldBy(
					{ run, runsDirectory },
					{ launchByPid, liveness, runEvents },
				)
			: undefined;

	return {
		caseId,
		checkpoints,
		grade: stage === undefined ? undefined : gradeByStage.get(stage),
		kind: "run",
		links,
		progress,
		recordId: formatRecordId({ kind: "run", run }),
		replayableStages: replayable,
		run,
		shortId,
		stage,
		status,
		...figures,
		launchId,
	};
}

export { rowFor as default };
