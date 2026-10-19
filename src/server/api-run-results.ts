import { Hono } from "hono";

import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { UsageError } from "#cli/commands";
import { parseRunRecordId } from "#cli/record-id";
import { commandRefusal } from "#server/api-refusal";
import { corpusSource } from "#server/api-source";
import type { ApiContext, ApiDependencies } from "#server/api-source";
import { readAnalysisReading } from "#server/root-cause-analyses";
import routes from "#server/route-factory";
import { readJudgedRunRecord } from "#server/run-record";
import { readStageTimes } from "#server/stage-times";

function judgedRunHandler(dependencies: ApiDependencies) {
	return async (context: ApiContext<"/api/runs/:run">) => {
		try {
			const id = parseRunRecordId(context.req.param("run"));

			return context.json(
				await readJudgedRunRecord(
					{ run: id.run, runsDirectory: dependencies.runsDirectory },
					dependencies.liveness,
					await corpusSource(dependencies),
				),
			);
		} catch (error) {
			if (
				error instanceof UsageError ||
				error instanceof RefusedPreconditionError
			) {
				const refusal = commandRefusal(error);
				return context.json({ error: refusal.message }, refusal.status);
			}

			throw error;
		}
	};
}

function runAnalysesHandler(dependencies: ApiDependencies) {
	return async (context: ApiContext<"/api/runs/:run/analyses">) => {
		try {
			const id = parseRunRecordId(context.req.param("run"));

			return context.json(
				await readAnalysisReading({
					run: id.run,
					runsDirectory: dependencies.runsDirectory,
				}),
			);
		} catch (error) {
			if (
				error instanceof UsageError ||
				error instanceof RefusedPreconditionError
			) {
				const refusal = commandRefusal(error);
				return context.json({ error: refusal.message }, refusal.status);
			}

			throw error;
		}
	};
}

function stageTimesHandler(dependencies: ApiDependencies) {
	return async (context: ApiContext<"/api/runs/:run/stage-times">) => {
		try {
			const id = parseRunRecordId(context.req.param("run"));

			return context.json(
				await readStageTimes(dependencies.runsDirectory, id.run),
			);
		} catch (error) {
			if (
				error instanceof UsageError ||
				error instanceof RefusedPreconditionError
			) {
				const refusal = commandRefusal(error);
				return context.json({ error: refusal.message }, refusal.status);
			}

			throw error;
		}
	};
}

const runResultsApi = routes((dependencies: ApiDependencies) =>
	new Hono()
		.get("/api/runs/:run", judgedRunHandler(dependencies))
		.get("/api/runs/:run/analyses", runAnalysesHandler(dependencies))
		.get("/api/runs/:run/stage-times", stageTimesHandler(dependencies)),
);

export { runResultsApi as default };
