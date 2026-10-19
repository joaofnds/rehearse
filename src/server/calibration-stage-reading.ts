import { basename } from "node:path";

import { unhandled } from "#benchmark/contracts";
import { readOperatorGrade } from "#benchmark/operator-grade";
import type { GradedStageRef } from "#benchmark/operator-grade";
import {
	confirmationGroupIds,
	confirmationRepIds,
	confirmationRepStageNames,
	recordedRunNames,
	replayAttemptIds,
	runStageFiles,
} from "#benchmark/run-layout";
import { CalibrationRefusalError } from "#server/calibration-contract";
import type {
	GradeableStage,
	JudgeGrade,
	StageCriteria,
} from "#server/calibration-contract";
import readGradeableStage from "#server/calibration-read-gradeable-stage";
import { gradedLetter } from "#server/calibration-stage-reference";
import { HTTP_STATUS_NOT_FOUND } from "#server/http-status";

const STAGE_FILE_SEPARATOR_WIDTH = 1;

async function stageRefs(
	runsDirectory: string,
): Promise<readonly GradedStageRef[]> {
	const refs: GradedStageRef[] = [];
	await Array.fromAsync(await recordedRunNames(runsDirectory), async (run) => {
		for (const file of await runStageFiles(runsDirectory, run)) {
			const stage = basename(file).slice(
				run.length + STAGE_FILE_SEPARATOR_WIDTH,
				-".json".length,
			);
			refs.push({ kind: "run", run, stage });
		}
	});
	await Array.fromAsync(
		await confirmationGroupIds(runsDirectory),
		async (groupId) => {
			await Array.fromAsync(
				await confirmationRepIds(runsDirectory, groupId),
				async (repId) => {
					for (const stage of await confirmationRepStageNames(
						runsDirectory,
						groupId,
						repId,
					)) {
						refs.push({ groupId, kind: "rep", repId, stage });
					}
				},
			);
		},
	);
	for (const { lineage, timestamp } of await replayAttemptIds(runsDirectory)) {
		refs.push({ kind: "replay", lineage, timestamp });
	}

	return refs;
}

function sameRef(left: GradedStageRef, right: GradedStageRef): boolean {
	switch (left.kind) {
		case "run": {
			return (
				right.kind === "run" &&
				right.run === left.run &&
				right.stage === left.stage
			);
		}
		case "rep": {
			return (
				right.kind === "rep" &&
				right.groupId === left.groupId &&
				right.repId === left.repId &&
				right.stage === left.stage
			);
		}
		case "replay": {
			return (
				right.kind === "replay" &&
				right.lineage === left.lineage &&
				right.timestamp === left.timestamp
			);
		}
		default: {
			return unhandled(left, "graded stage kind");
		}
	}
}

/**
 * Only a stage the records list: a run name holds a dot, so a run and stage
 * split at another dot would read the same record and key a second grade.
 */
async function requiredStage(
	runsDirectory: string,
	ref: GradedStageRef,
): Promise<GradeableStage> {
	const refs = await stageRefs(runsDirectory);
	const listed = refs.some((each) => sameRef(each, ref));
	const stage = listed
		? await readGradeableStage(runsDirectory, ref)
		: undefined;
	if (stage === undefined) {
		throw new CalibrationRefusalError(
			HTTP_STATUS_NOT_FOUND,
			"No stage the Judge graded is recorded there",
		);
	}

	return stage;
}

/**
 * Before the operator grades, only the frozen input the Judge read and the
 * rubric's criteria: a grade given after seeing anything the Judge returned
 * measures anchoring rather than how far to trust a grade.
 */
async function stageReview(
	runsDirectory: string,
	ref: GradedStageRef,
): Promise<{
	readonly stage: GradedStageRef;
	readonly stageName: string;
	readonly judgeModel: string | null;
	readonly criteria: StageCriteria;
	readonly input: Readonly<Record<string, string>>;
	readonly operatorGrade?: ReturnType<typeof gradedLetter>;
	readonly judgeGrade?: JudgeGrade;
}> {
	const stage = await requiredStage(runsDirectory, ref);
	const operatorGrade = await readOperatorGrade(runsDirectory, ref);
	const form = {
		criteria: stage.criteria,
		input: stage.input,
		judgeModel: stage.judgeModel ?? null,
		stage: ref,
		stageName: stage.stageName,
	};

	return operatorGrade === undefined
		? form
		: {
				...form,
				judgeGrade: stage.judgeGrade,
				operatorGrade: gradedLetter(operatorGrade),
			};
}

export { stageRefs, requiredStage, stageReview };
