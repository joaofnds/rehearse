import { Hono } from "hono";

import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { UsageError } from "#cli/commands";
import {
	comparisonDiff,
	comparisonReading,
} from "#server/api-comparison-reading";
import { commandRefusal } from "#server/api-refusal";
import type { ApiContext, ApiDependencies } from "#server/api-source";
import comparisonIndex from "#server/comparison-index";
import routes from "#server/route-factory";

function comparisonIndexHandler(dependencies: ApiDependencies) {
	return async (context: ApiContext<"/api/comparisons">) =>
		context.json(await comparisonIndex(dependencies.runsDirectory));
}

function comparisonHandler(dependencies: ApiDependencies) {
	return async (context: ApiContext<"/api/comparisons/:digest">) => {
		try {
			return context.json(
				await comparisonReading({
					digest: context.req.param("digest"),
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

function comparisonDiffHandler(dependencies: ApiDependencies) {
	return async (context: ApiContext<"/api/comparisons/:digest/arm-diff">) => {
		try {
			return context.json(
				await comparisonDiff({
					digest: context.req.param("digest"),
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

const comparisonsApi = routes((dependencies: ApiDependencies) =>
	new Hono()
		.get("/api/comparisons", comparisonIndexHandler(dependencies))
		.get("/api/comparisons/:digest", comparisonHandler(dependencies))
		.get(
			"/api/comparisons/:digest/arm-diff",
			comparisonDiffHandler(dependencies),
		),
);

export { comparisonsApi as default };
