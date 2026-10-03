import type { InferResponseType } from "hono/client";
import type { Immutable } from "#benchmark/contracts";
import type { GradedStageRef, OperatorGrade } from "#benchmark/operator-grade";
import { calibrationClient } from "#client/api-client";

const runStage =
	calibrationClient.api.calibration.runs[":run"].stages[":stage"];
const repStage =
	calibrationClient.api.calibration.groups[":groupId"].reps[":repId"].stages[
		":stage"
	];
const replayStage =
	calibrationClient.api.calibration.replays[":lineage"][":timestamp"];

export type StageReview = Immutable<
	InferResponseType<typeof runStage.$get, 200>
>;

export type GradeRecorded = Immutable<
	InferResponseType<typeof runStage.grade.$post, 201>
>;

export class GradeRefusedError extends Error {
	public override name = "GradeRefusedError";
}

function reviewResponse(
	stage: GradedStageRef,
): Promise<Awaited<ReturnType<typeof runStage.$get>>> {
	switch (stage.kind) {
		case "run": {
			return runStage.$get({ param: { run: stage.run, stage: stage.stage } });
		}
		case "rep": {
			return repStage.$get({
				param: {
					groupId: stage.groupId,
					repId: stage.repId,
					stage: stage.stage,
				},
			});
		}
		case "replay": {
			return replayStage.$get({
				param: { lineage: stage.lineage, timestamp: stage.timestamp },
			});
		}
		default: {
			return stage satisfies never;
		}
	}
}

async function fetchStageReview(stage: GradedStageRef): Promise<StageReview> {
	const response = await reviewResponse(stage);
	if (response.status !== 200) {
		throw new Error("Could not load this judged step");
	}

	return response.json();
}

export interface StageReviewQuery {
	readonly queryKey: readonly ["calibration", "review", GradedStageRef];
	readonly queryFn: () => Promise<StageReview>;
}

export function stageReviewQuery(stage: GradedStageRef): StageReviewQuery {
	return {
		queryKey: ["calibration", "review", stage],
		queryFn: () => fetchStageReview(stage),
	};
}

/** The route reads the body as sent, so it travels as the JSON text the server parses. */
function gradeResponse(
	stage: GradedStageRef,
	grade: OperatorGrade,
): Promise<Awaited<ReturnType<typeof runStage.grade.$post>>> {
	const options = {
		headers: { "Content-Type": "application/json" },
		init: { body: JSON.stringify(grade) },
	};
	switch (stage.kind) {
		case "run": {
			return runStage.grade.$post(
				{ param: { run: stage.run, stage: stage.stage } },
				options,
			);
		}
		case "rep": {
			return repStage.grade.$post(
				{
					param: {
						groupId: stage.groupId,
						repId: stage.repId,
						stage: stage.stage,
					},
				},
				options,
			);
		}
		case "replay": {
			return replayStage.grade.$post(
				{ param: { lineage: stage.lineage, timestamp: stage.timestamp } },
				options,
			);
		}
		default: {
			return stage satisfies never;
		}
	}
}

/** A refusal the route declares arrives as `{ error }`, which the operator reads as the reason. */
export async function recordGrade(
	stage: GradedStageRef,
	grade: OperatorGrade,
): Promise<GradeRecorded> {
	const response = await gradeResponse(stage, grade);
	if (response.status === 201) {
		return response.json();
	}

	const refusal = await response.json();
	throw new GradeRefusedError(refusal.error);
}
