import { benchmarkRunPaths } from "#benchmark/run-layout";
import type { RunLocation } from "#benchmark/run-layout";
import { redactAbsolutePaths } from "#server/redact-path";
import type {
	ListedStageGrade,
	PipelineRunRow,
	RunFigures,
	RunLivenessContext,
} from "#server/run-history-contract";
import { firedBlockersOf } from "#server/run-history-group-fired-blockers";
import {
	currentStageIndex,
	readRunRecord,
	stagePlace,
} from "#server/run-record";
import type { RunRecord } from "#server/run-record";

const FINAL_MEASURED_CORPUS_VERSION_OFFSET = -1;

const SINGLE_DISTINCT_VALUE_COUNT = 1;

const NO_MANIFEST_REASON = "the run wrote no manifest, which names its stages";

/**
 * A stage with no record is one the run never reached when it comes after the
 * stage the run ended or is running in. A run that finished reached every
 * stage, and a stage before the one it ended in ran and left no record.
 */
function stageGrades(record: RunRecord): readonly ListedStageGrade[] {
	const currentIndex = currentStageIndex(
		record.stages.map(({ stage }) => stage),
		record.finalOutcome,
	);

	return record.stages.map(({ stage, status, grade }, index) =>
		status === "no-record" && stagePlace(index, currentIndex) === "unreached"
			? { grade, stage, status: "not-run" }
			: { grade, stage, status },
	);
}

/**
 * A run's version is its latest stage's, whether that stage saved a
 * checkpoint or stopped, and the one it recorded at its start until a stage
 * has measured its own. The corpus changed during the run when its stages
 * measured more than one version. A refusal is not a version, and a record
 * older than versions measured none, so neither counts toward a change.
 */
function runCorpus(
	record: RunRecord,
): Pick<PipelineRunRow, "corpusVersion" | "corpusChangedDuringRun"> {
	const measured = record.stages
		.map(({ corpusVersion }) => corpusVersion)
		.filter((corpusVersion) => corpusVersion !== undefined);
	const digests = new Set(
		measured.flatMap((corpusVersion) =>
			corpusVersion.kind === "version" ? [corpusVersion.digest] : [],
		),
	);

	return {
		corpusChangedDuringRun: digests.size > SINGLE_DISTINCT_VALUE_COUNT,
		corpusVersion:
			measured.at(FINAL_MEASURED_CORPUS_VERSION_OFFSET) ??
			record.identity.corpusVersion,
	};
}

/**
 * The figures a run's row shares with its run record, read through the same
 * projection. A record that cannot be read leaves the row listed, with each
 * figure unavailable for that reason.
 */
async function runFigures(
	{ runsDirectory, run }: RunLocation,
	{ liveness, runEvents }: RunLivenessContext,
): Promise<RunFigures> {
	const { manifestFile } = benchmarkRunPaths(runsDirectory, run);
	if (!(await Bun.file(manifestFile).exists())) {
		return unavailableFigures([NO_MANIFEST_REASON]);
	}

	try {
		const record = await readRunRecord(
			{ run, runsDirectory },
			liveness,
			runEvents,
		);

		return {
			cost: record.totals.cost,
			finalOutcome: { state: "available", ...record.finalOutcome },
			firedBlockers: firedBlockersOf(
				record.stages.map(({ blockers }) =>
					blockers.state === "available"
						? { ids: blockers.firedIds, state: "available" }
						: blockers,
				),
			),
			minimumGrade: record.minimumGrade,
			stageGrades: {
				grades: stageGrades(record),
				state: "available",
			},
			wallTime: record.totals.wallTime,
			...runCorpus(record),
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		return unavailableFigures([redactAbsolutePaths(message)]);
	}
}

function unavailableFigures(reasons: readonly string[]): RunFigures {
	return {
		corpusChangedDuringRun: false,
		corpusVersion: undefined,
		cost: { reasons, state: "unavailable" },
		finalOutcome: { reasons, state: "unavailable" },
		firedBlockers: { reasons, state: "unavailable" },
		minimumGrade: { reasons, state: "unavailable" },
		stageGrades: { reasons, state: "unavailable" },
		wallTime: { reasons, state: "unavailable" },
	};
}

export { NO_MANIFEST_REASON, runFigures };
