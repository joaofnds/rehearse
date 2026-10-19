import { readdir } from "node:fs/promises";

import type {
	CalibratableArtifact,
	CalibratableStageRecord,
} from "#benchmark/calibration-record";
import { calibratableStageRecordSchema } from "#benchmark/calibration-record";
import { displayPath } from "#benchmark/config";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import serialMap from "#benchmark/serial-map";
import { RefusedPreconditionError } from "#cli/interactive-stdin";

import { loadFinalArtifact, readRecord } from "./calibration-record-read";

const STAGE_FILE_SEPARATOR_WIDTH = 1;

const COMES_AFTER = 1;
const COMES_BEFORE = -1;

/**
 * The two records a run may leave for calibration: the artifact a graded run
 * writes, and the stage file a run stopped at a stage writes. The command
 * reads what is on disk rather than taking a flag naming which case it is in,
 * because the run already decided that and a second answer could disagree.
 */
type CalibratableRecord =
	| {
			readonly kind: "final";
			readonly file: string;
			readonly record: CalibratableArtifact;
	  }
	| {
			readonly kind: "stage";
			readonly file: string;
			readonly record: CalibratableStageRecord;
	  };

async function loadRecord(
	runsDirectory: string,
	run: string,
): Promise<CalibratableRecord> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	if (await Bun.file(paths.artifactFile).exists()) {
		return await loadFinalArtifact({ file: paths.artifactFile, run });
	}

	return await loadStoppedStage(runsDirectory, run);
}

/**
 * A stopped run's stage file is named for the stage it stopped at, which the
 * command does not know until it looks. Exactly one stage may stop, so the one
 * record carrying a STOP verdict and no calibration is the one to complete.
 */
async function loadStoppedStage(
	runsDirectory: string,
	run: string,
): Promise<CalibratableRecord> {
	const paths = benchmarkRunPaths(runsDirectory, run);
	const stages = await stageNamesOf({
		file: paths.artifactFile,
		run,
		runsDirectory,
	});
	for await (const inspection of serialMap(stages.values(), async (stage) => {
		const file = paths.stageFile(stage);
		return {
			file,
			parsed: await readRecord(file, calibratableStageRecordSchema),
		};
	})) {
		const { file, parsed } = inspection;
		if (
			parsed.success &&
			parsed.data.grade.verdict === "STOP" &&
			parsed.data.calibration === undefined
		) {
			return { file, kind: "stage", record: parsed.data };
		}
	}

	throw new RefusedPreconditionError(
		`No run ${run} awaiting calibration at ${displayPath(paths.artifactFile)}`,
	);
}

const STAGE_FILE_SUFFIX = ".json";

interface StageDirectoryRequest {
	readonly file: string;
	readonly run: string;
	readonly runsDirectory: string;
}

async function readStageDirectory(
	request: StageDirectoryRequest,
): Promise<readonly string[]> {
	try {
		return await readdir(request.runsDirectory);
	} catch (error) {
		const failure = new RefusedPreconditionError(
			`No run ${request.run} awaiting calibration at ${displayPath(request.file)}`,
		);
		failure.cause = error;

		throw failure;
	}
}

async function stageNamesOf(
	request: StageDirectoryRequest,
): Promise<readonly string[]> {
	const { run } = request;
	const entries = await readStageDirectory(request);

	return entries
		.filter(
			(entry) =>
				entry.startsWith(`${run}.`) && entry.endsWith(STAGE_FILE_SUFFIX),
		)
		.map((entry) =>
			entry.slice(
				run.length + STAGE_FILE_SEPARATOR_WIDTH,
				-STAGE_FILE_SUFFIX.length,
			),
		)
		.filter((stage) => stage !== "" && stage !== "review")
		.toSorted((left, right) => (left < right ? COMES_BEFORE : COMES_AFTER));
}

export { loadRecord as default };

export type { CalibratableRecord };
