import type { z } from "zod";

import { groupStartedAtSchema } from "#benchmark/confirmation-record";
import { unhandled } from "#benchmark/contracts";
import parseJsonDocument from "#benchmark/json-document";
import type { GradedStageRef } from "#benchmark/operator-grade";
import {
	benchmarkRunPaths,
	confirmationGroupPaths,
	replayRecordFile,
} from "#benchmark/run-layout";
import type { GradeableStage } from "#server/calibration-contract";
import {
	groupJudgeModelSchema,
	judgedStageSchema,
	manifestJudgeModelSchema,
	replayScorecardSchema,
} from "#server/calibration-gradeable-schema";

/**
 * A record that is not there, is not JSON, or is not the shape asked for
 * holds nothing to grade: a stage whose judging never returned a letter is
 * one of those.
 */
async function readRecord<Recorded>(
	path: string,
	schema: z.ZodType<Recorded>,
): Promise<Recorded | undefined> {
	const file = Bun.file(path);
	if (!(await file.exists())) {
		return undefined;
	}

	const documentReading = parseJsonDocument(await file.text(), schema);
	if (documentReading.kind === "invalid-json") {
		if (!(documentReading.error instanceof SyntaxError)) {
			throw documentReading.error;
		}

		return undefined;
	}

	const { parsed } = documentReading;

	return parsed.success ? parsed.data : undefined;
}

async function readRunGradeableStage(
	runsDirectory: string,
	ref: Extract<GradedStageRef, { readonly kind: "run" }>,
): Promise<GradeableStage | undefined> {
	const paths = benchmarkRunPaths(runsDirectory, ref.run);
	const judged = await readRecord(
		paths.stageFile(ref.stage),
		judgedStageSchema,
	);
	if (judged === undefined) {
		return undefined;
	}

	return {
		...judged,
		judgeModel:
			judged.judgeModel ??
			(await readRecord(paths.manifestFile, manifestJudgeModelSchema)),
		recordedTime: ref.run,
		ref,
		stageName: ref.stage,
	};
}

async function readRepGradeableStage(
	runsDirectory: string,
	ref: Extract<GradedStageRef, { readonly kind: "rep" }>,
): Promise<GradeableStage | undefined> {
	const group = confirmationGroupPaths(runsDirectory, ref.groupId);
	const judged = await readRecord(
		group.rep(ref.repId).stageFile(ref.stage),
		judgedStageSchema,
	);
	if (judged === undefined) {
		return undefined;
	}

	return {
		...judged,
		judgeModel:
			judged.judgeModel ??
			(await readRecord(group.groupFile, groupJudgeModelSchema)),
		recordedTime: await readRecord(group.groupFile, groupStartedAtSchema),
		ref,
		stageName: ref.stage,
	};
}

async function readReplayGradeableStage(
	runsDirectory: string,
	ref: Extract<GradedStageRef, { readonly kind: "replay" }>,
): Promise<GradeableStage | undefined> {
	const replay = await readRecord(
		replayRecordFile(runsDirectory, ref.lineage, ref.timestamp),
		replayScorecardSchema,
	);
	if (replay === undefined) {
		return undefined;
	}

	return {
		...replay.scorecard,
		judgeModel: replay.judgeModel,
		recordedTime: ref.timestamp,
		ref,
		stageName: replay.stage,
	};
}

async function readGradeableStage(
	runsDirectory: string,
	ref: GradedStageRef,
): Promise<GradeableStage | undefined> {
	switch (ref.kind) {
		case "run": {
			return await readRunGradeableStage(runsDirectory, ref);
		}
		case "rep": {
			return await readRepGradeableStage(runsDirectory, ref);
		}
		case "replay": {
			return await readReplayGradeableStage(runsDirectory, ref);
		}
		default: {
			return unhandled(ref, "graded stage kind");
		}
	}
}

export { readGradeableStage as default };
