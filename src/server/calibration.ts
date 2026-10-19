import { Hono } from "hono";

import calibrationReport from "#server/calibration-calibration-report";
import { CalibrationRefusalError } from "#server/calibration-contract";
import type { CalibrationDependencies } from "#server/calibration-contract";
import {
	operatorGradeFrom,
	recordOperatorGrade,
} from "#server/calibration-operator-grade";
import { stageReview } from "#server/calibration-stage-reading";
import {
	repStageRef,
	replayStageRef,
	runStageRef,
} from "#server/calibration-stage-reference";
import { HTTP_STATUS_CREATED } from "#server/http-status";
import routes from "#server/route-factory";

const groupCalibrationApi = routes(
	({ runsDirectory }: CalibrationDependencies) =>
		new Hono()
			.get(
				"/api/calibration/groups/:groupId/reps/:repId/stages/:stage",
				async (context) => {
					try {
						const stage = repStageRef(context.req.param());
						return context.json(await stageReview(runsDirectory, stage));
					} catch (error) {
						if (!(error instanceof CalibrationRefusalError)) {
							throw error;
						}

						return context.json({ error: error.message }, error.status);
					}
				},
			)
			.post(
				"/api/calibration/groups/:groupId/reps/:repId/stages/:stage/grade",
				async (context) => {
					try {
						const stage = repStageRef(context.req.param());
						const grade = operatorGradeFrom(await context.req.text());
						return context.json(
							await recordOperatorGrade(runsDirectory, stage, grade),
							HTTP_STATUS_CREATED,
						);
					} catch (error) {
						if (!(error instanceof CalibrationRefusalError)) {
							throw error;
						}

						return context.json({ error: error.message }, error.status);
					}
				},
			),
);

const replayCalibrationApi = routes(
	({ runsDirectory }: CalibrationDependencies) =>
		new Hono()
			.get("/api/calibration/replays/:lineage/:timestamp", async (context) => {
				try {
					const stage = replayStageRef(context.req.param());
					return context.json(await stageReview(runsDirectory, stage));
				} catch (error) {
					if (!(error instanceof CalibrationRefusalError)) {
						throw error;
					}

					return context.json({ error: error.message }, error.status);
				}
			})
			.post(
				"/api/calibration/replays/:lineage/:timestamp/grade",
				async (context) => {
					try {
						const stage = replayStageRef(context.req.param());
						const grade = operatorGradeFrom(await context.req.text());
						return context.json(
							await recordOperatorGrade(runsDirectory, stage, grade),
							HTTP_STATUS_CREATED,
						);
					} catch (error) {
						if (!(error instanceof CalibrationRefusalError)) {
							throw error;
						}

						return context.json({ error: error.message }, error.status);
					}
				},
			),
);

const runCalibrationApi = routes(({ runsDirectory }: CalibrationDependencies) =>
	new Hono()
		.get("/api/calibration/runs/:run/stages/:stage", async (context) => {
			try {
				const stage = runStageRef(context.req.param());
				return context.json(await stageReview(runsDirectory, stage));
			} catch (error) {
				if (!(error instanceof CalibrationRefusalError)) {
					throw error;
				}

				return context.json({ error: error.message }, error.status);
			}
		})
		.post("/api/calibration/runs/:run/stages/:stage/grade", async (context) => {
			try {
				const stage = runStageRef(context.req.param());
				const grade = operatorGradeFrom(await context.req.text());
				return context.json(
					await recordOperatorGrade(runsDirectory, stage, grade),
					HTTP_STATUS_CREATED,
				);
			} catch (error) {
				if (!(error instanceof CalibrationRefusalError)) {
					throw error;
				}

				return context.json({ error: error.message }, error.status);
			}
		}),
);

const createCalibrationApp = routes((dependencies: CalibrationDependencies) =>
	new Hono()
		.get("/api/calibration", async (context) =>
			context.json(await calibrationReport(dependencies.runsDirectory)),
		)
		.route("/", runCalibrationApi(dependencies))
		.route("/", groupCalibrationApi(dependencies))
		.route("/", replayCalibrationApi(dependencies)),
);

export { createCalibrationApp as default };
export type {
	CalibrationDependencies,
	CalibrationRoutes,
} from "#server/calibration-contract";
