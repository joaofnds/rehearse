import { Hono } from "hono";

import { UsageError } from "#cli/commands";
import evidenceSourceAnswer from "#server/api-evidence-source";
import { commandRefusal, historyError } from "#server/api-refusal";
import type { ApiContext, ApiDependencies } from "#server/api-source";
import { readAttemptEvidence } from "#server/attempt-evidence";
import routes from "#server/route-factory";
import { SessionHistoryReaderError } from "#server/session-history-reader";

function stageEvidenceHandler(dependencies: ApiDependencies) {
	return async (
		context: ApiContext<"/api/runs/:run/stages/:stage/evidence/:section/:item/:index">,
	) => {
		const answer = await evidenceSourceAnswer({
			index: context.req.param("index"),
			item: context.req.param("item"),
			judge: { kind: "stage", stage: context.req.param("stage") },
			run: context.req.param("run"),
			runsDirectory: dependencies.runsDirectory,
			section: context.req.param("section"),
		});

		return answer.found
			? context.json(answer.source)
			: context.json({ error: answer.error.message }, answer.error.status);
	};
}

function finalEvidenceHandler(dependencies: ApiDependencies) {
	return async (
		context: ApiContext<"/api/runs/:run/final/evidence/:item/:index">,
	) => {
		const answer = await evidenceSourceAnswer({
			index: context.req.param("index"),
			item: context.req.param("item"),
			judge: { kind: "final" },
			run: context.req.param("run"),
			runsDirectory: dependencies.runsDirectory,
			section: "requirements",
		});

		return answer.found
			? context.json(answer.source)
			: context.json({ error: answer.error.message }, answer.error.status);
	};
}

function attemptEvidenceHandler(dependencies: ApiDependencies) {
	return async (context: ApiContext<"/api/attempt-evidence/:id">) => {
		try {
			return context.json(
				await readAttemptEvidence({
					id: context.req.param("id"),
					runsDirectory: dependencies.runsDirectory,
				}),
			);
		} catch (error) {
			if (error instanceof SessionHistoryReaderError) {
				const response = historyError(error);
				return context.json({ error: response.message }, response.status);
			}

			if (error instanceof UsageError) {
				const response = commandRefusal(error);
				return context.json({ error: response.message }, response.status);
			}

			throw error;
		}
	};
}

const evidenceApi = routes((dependencies: ApiDependencies) =>
	new Hono()
		.get(
			"/api/runs/:run/stages/:stage/evidence/:section/:item/:index",
			stageEvidenceHandler(dependencies),
		)
		.get(
			"/api/runs/:run/final/evidence/:item/:index",
			finalEvidenceHandler(dependencies),
		)
		.get("/api/attempt-evidence/:id", attemptEvidenceHandler(dependencies)),
);

export { evidenceApi as default };
