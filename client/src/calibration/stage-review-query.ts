import type { InferResponseType } from "hono/client";

import type { Immutable } from "#benchmark/contracts";
import type { GradedStageRef, OperatorGrade } from "#benchmark/operator-grade";
import { calibrationClient } from "#client/api-client";
import HTTP_STATUS from "#client/http-status";
import RecordNotFoundError from "#client/record-not-found";

const runStage =
	calibrationClient.api.calibration.runs[":run"].stages[":stage"];

const repStage =
	calibrationClient.api.calibration.groups[":groupId"].reps[":repId"].stages[
		":stage"
	];

const replayStage =
	calibrationClient.api.calibration.replays[":lineage"][":timestamp"];

type StageReview = Immutable<
	InferResponseType<typeof runStage.$get, typeof HTTP_STATUS.ok>
>;

type GradeRecorded = Immutable<
	InferResponseType<typeof runStage.grade.$post, typeof HTTP_STATUS.created>
>;

/**
 * The Hono RPC client writes each path param into the URL as given, so a `/`
 * or `..` the router decoded from the link would move the request to another
 * stage unless it is escaped here, as the evidence source query does.
 */
const escaped = encodeURIComponent;

class GradeRefusedError extends Error {
	public override name = "GradeRefusedError";
}

async function reviewResponse(
	stage: GradedStageRef,
): Promise<Awaited<ReturnType<typeof runStage.$get>>> {
	switch (stage.kind) {
		case "run": {
			return await runStage.$get({
				param: { run: escaped(stage.run), stage: escaped(stage.stage) },
			});
		}
		case "rep": {
			return await repStage.$get({
				param: {
					groupId: escaped(stage.groupId),
					repId: escaped(stage.repId),
					stage: escaped(stage.stage),
				},
			});
		}
		case "replay": {
			return await replayStage.$get({
				param: {
					lineage: escaped(stage.lineage),
					timestamp: escaped(stage.timestamp),
				},
			});
		}
		default: {
			const result = stage satisfies never;
			return result;
		}
	}
}

async function fetchStageReview(stage: GradedStageRef): Promise<StageReview> {
	const response = await reviewResponse(stage);
	// A refused name names no record either, and asking again changes nothing.
	if (
		response.status === HTTP_STATUS.notFound ||
		response.status === HTTP_STATUS.badRequest
	) {
		throw new RecordNotFoundError(
			"No stage the Judge graded is recorded there",
		);
	}
	if (response.status !== HTTP_STATUS.ok) {
		throw new Error("Could not load this judged step");
	}

	return await response.json();
}

interface StageReviewQuery {
	readonly queryKey: readonly ["calibration", "review", GradedStageRef];
	readonly queryFn: () => Promise<StageReview>;
}

function stageReviewQuery(stage: GradedStageRef): StageReviewQuery {
	return {
		queryFn: async () => await fetchStageReview(stage),
		queryKey: ["calibration", "review", stage],
	};
}

/** The route reads the body as sent, so it travels as the JSON text the server parses. */
async function gradeResponse(
	stage: GradedStageRef,
	grade: OperatorGrade,
): Promise<Awaited<ReturnType<typeof runStage.grade.$post>>> {
	const options = {
		headers: { "Content-Type": "application/json" },
		init: { body: JSON.stringify(grade) },
	};
	switch (stage.kind) {
		case "run": {
			return await runStage.grade.$post(
				{ param: { run: escaped(stage.run), stage: escaped(stage.stage) } },
				options,
			);
		}
		case "rep": {
			return await repStage.grade.$post(
				{
					param: {
						groupId: escaped(stage.groupId),
						repId: escaped(stage.repId),
						stage: escaped(stage.stage),
					},
				},
				options,
			);
		}
		case "replay": {
			return await replayStage.grade.$post(
				{
					param: {
						lineage: escaped(stage.lineage),
						timestamp: escaped(stage.timestamp),
					},
				},
				options,
			);
		}
		default: {
			const result = stage satisfies never;
			return result;
		}
	}
}

/**
 * A refusal the route declares arrives as `{ error }`, which the operator reads
 * as the reason. Anything else, the request guard's plain-text 403 included,
 * is shown as the server sent it.
 */
async function recordGrade(
	stage: GradedStageRef,
	grade: OperatorGrade,
): Promise<GradeRecorded> {
	const response = await gradeResponse(stage, grade);
	if (response.status === HTTP_STATUS.created) {
		return await response.json();
	}
	if (
		response.status === HTTP_STATUS.badRequest ||
		response.status === HTTP_STATUS.notFound ||
		response.status === HTTP_STATUS.conflict
	) {
		const refusal = await response.json();
		throw new GradeRefusedError(refusal.error);
	}

	throw new GradeRefusedError(await response.text());
}

export { GradeRefusedError, recordGrade, stageReviewQuery };
export type { GradeRecorded, StageReview, StageReviewQuery };
