import { Hono } from "hono";

import { historyError } from "#server/api-refusal";
import { corpusSource } from "#server/api-source";
import type { ApiContext, ApiDependencies } from "#server/api-source";
import routes from "#server/route-factory";
import { readStageOutput } from "#server/run-investigation";
import { SessionHistoryReaderError } from "#server/session-history-reader";
import readStageAttempts from "#server/stage-attempts";
import readStageJudge from "#server/stage-judge";
import readStageSession from "#server/stage-session";

function stageSessionHandler(dependencies: ApiDependencies) {
	return async (
		context: ApiContext<"/api/runs/:run/stages/:stage/session">,
	) => {
		try {
			return context.json(
				await readStageSession({
					projectsDirectory: dependencies.projectsDirectory,
					run: context.req.param("run"),
					runsDirectory: dependencies.runsDirectory,
					stage: context.req.param("stage"),
				}),
			);
		} catch (error) {
			if (!(error instanceof SessionHistoryReaderError)) {
				throw error;
			}

			const response = historyError(error);

			return context.json({ error: response.message }, response.status);
		}
	};
}

function stageOutputHandler(dependencies: ApiDependencies) {
	return async (context: ApiContext<"/api/runs/:run/stages/:stage/output">) => {
		try {
			return context.json(
				await readStageOutput({
					run: context.req.param("run"),
					runsDirectory: dependencies.runsDirectory,
					stage: context.req.param("stage"),
				}),
			);
		} catch (error) {
			if (!(error instanceof SessionHistoryReaderError)) {
				throw error;
			}

			const response = historyError(error);

			return context.json({ error: response.message }, response.status);
		}
	};
}

function stageJudgeHandler(dependencies: ApiDependencies) {
	return async (context: ApiContext<"/api/runs/:run/stages/:stage/judge">) => {
		try {
			return context.json(
				await readStageJudge({
					run: context.req.param("run"),
					runsDirectory: dependencies.runsDirectory,
					stage: context.req.param("stage"),
				}),
			);
		} catch (error) {
			if (!(error instanceof SessionHistoryReaderError)) {
				throw error;
			}

			const response = historyError(error);

			return context.json({ error: response.message }, response.status);
		}
	};
}

function stageAttemptsHandler(dependencies: ApiDependencies) {
	return async (
		context: ApiContext<"/api/runs/:run/stages/:stage/attempts">,
	) => {
		try {
			return context.json(
				await readStageAttempts({
					run: context.req.param("run"),
					runsDirectory: dependencies.runsDirectory,
					source: await corpusSource(dependencies),
					stage: context.req.param("stage"),
				}),
			);
		} catch (error) {
			if (!(error instanceof SessionHistoryReaderError)) {
				throw error;
			}

			const response = historyError(error);

			return context.json({ error: response.message }, response.status);
		}
	};
}

const stageResultsApi = routes((dependencies: ApiDependencies) =>
	new Hono()
		.get(
			"/api/runs/:run/stages/:stage/session",
			stageSessionHandler(dependencies),
		)
		.get(
			"/api/runs/:run/stages/:stage/output",
			stageOutputHandler(dependencies),
		)
		.get("/api/runs/:run/stages/:stage/judge", stageJudgeHandler(dependencies))
		.get(
			"/api/runs/:run/stages/:stage/attempts",
			stageAttemptsHandler(dependencies),
		),
);

export { stageResultsApi as default };
