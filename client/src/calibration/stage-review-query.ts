import type { InferResponseType } from "hono/client";
import type { Immutable } from "#benchmark/contracts";
import type { GradedStageRef, OperatorGrade } from "#benchmark/operator-grade";
import { calibrationClient } from "#client/api-client";
import { RecordNotFoundError } from "#client/record-not-found";

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

/**
 * The Hono RPC client writes each path param into the URL as given, so a `/`
 * or `..` the router decoded from the link would move the request to another
 * stage unless it is escaped here, as the evidence source query does.
 */
const escaped = encodeURIComponent;

export class GradeRefusedError extends Error {
	public override name = "GradeRefusedError";
}

function reviewResponse(
	stage: GradedStageRef,
): Promise<Awaited<ReturnType<typeof runStage.$get>>> {
	switch (stage.kind) {
		case "run": {
			return runStage.$get({
				param: { run: escaped(stage.run), stage: escaped(stage.stage) },
			});
		}
		case "rep": {
			return repStage.$get({
				param: {
					groupId: escaped(stage.groupId),
					repId: escaped(stage.repId),
					stage: escaped(stage.stage),
				},
			});
		}
		case "replay": {
			return replayStage.$get({
				param: {
					lineage: escaped(stage.lineage),
					timestamp: escaped(stage.timestamp),
				},
			});
		}
		default: {
			return stage satisfies never;
		}
	}
}

async function fetchStageReview(stage: GradedStageRef): Promise<StageReview> {
	const response = await reviewResponse(stage);
	// A refused name names no record either, and asking again changes nothing.
	if (response.status === 404 || response.status === 400) {
		throw new RecordNotFoundError(
			"No stage the Judge graded is recorded there",
		);
	}
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
				{ param: { run: escaped(stage.run), stage: escaped(stage.stage) } },
				options,
			);
		}
		case "rep": {
			return repStage.grade.$post(
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
			return replayStage.grade.$post(
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
			return stage satisfies never;
		}
	}
}

/**
 * A refusal the route declares arrives as `{ error }`, which the operator reads
 * as the reason. Anything else, the request guard's plain-text 403 included,
 * is shown as the server sent it.
 */
export async function recordGrade(
	stage: GradedStageRef,
	grade: OperatorGrade,
): Promise<GradeRecorded> {
	const response = await gradeResponse(stage, grade);
	if (response.status === 201) {
		return response.json();
	}
	if (
		response.status === 400 ||
		response.status === 404 ||
		response.status === 409
	) {
		const refusal = await response.json();
		throw new GradeRefusedError(refusal.error);
	}

	throw new GradeRefusedError(await response.text());
}
